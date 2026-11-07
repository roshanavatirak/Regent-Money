package com.regentmoney.intro

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.LinearGradient
import android.graphics.Typeface
import android.os.Build
import android.provider.Settings
import android.util.AttributeSet
import android.view.Choreographer
import android.view.View
import androidx.core.graphics.PathParser
import com.regentmoney.R
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Native launch intro ("Sorted"), drawn on one Canvas in dp units.
 *
 * Driven by a Choreographer clock rather than a ValueAnimator so it is NOT affected
 * by the system "animator duration scale" (a ValueAnimator would jump to the end when
 * animations are off and the intro would just vanish).
 *
 * Flow: play to [B.HOLD], wait there until React Native reports ready, then play a
 * short exit (tile zooms, everything fades) that reveals the app underneath.
 */
class IntroView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    /* ---------------- brand (same palette as the app) ---------------- */

    private val BG = Color.parseColor("#F3F6F4")
    private val FOREST = Color.parseColor("#0B3D2C")
    private val LIME = Color.parseColor("#B8F36B")
    private val GREEN = Color.parseColor("#16A34A")
    private val INK = Color.parseColor("#0B1F17")
    private val BODY = Color.parseColor("#5E7A6C")
    private val LINE = Color.parseColor("#E1E9E4")
    private val MIST = Color.parseColor("#E3F2E8")
    private val WHITE = Color.WHITE

    /* ---------------- state ---------------- */

    private val density = resources.displayMetrics.density
    private var timeline: IntroTimeline? = null
    private var glow: Shader? = null
    private var sheenShader: Shader? = null
    private var logo: Bitmap? = null

    private var clock = 0f
    private var holdMs = 0f
    private var lastFrameNanos = 0L
    private var running = false
    private var paused = false
    private var isAppReady = false
    private var waitingForApp = false
    private var isDismissing = false
    private var reduceMotion = false
    private var exitStartNanos = 0L
    private var exitProgress = 0f
    private var onFinish: (() -> Unit)? = null
    private val frameCallback = Choreographer.FrameCallback { now -> onFrame(now) }
    private val exitCallback = Choreographer.FrameCallback { now -> onExitFrame(now) }

    /* ---------------- paints (allocated once) ---------------- */

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val sheenPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val tileShadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = FOREST
        setShadowLayer(20f, 0f, 12f, withAlpha(FOREST, 0.35f))
    }
    private val pillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = WHITE
        setShadowLayer(14f, 0f, 8f, withAlpha(FOREST, 0.14f))
    }
    private val labelPaint = textPaint(13.5f, 600, INK, Paint.Align.LEFT)
    private val amountPaint = textPaint(13.5f, 700, INK, Paint.Align.RIGHT)
    private val fromPaint = textPaint(13f, 400, BODY, Paint.Align.CENTER).apply { letterSpacing = 0.4f / 13f }
    private val studioPaint = textPaint(16f, 700, INK, Paint.Align.CENTER).apply { letterSpacing = 0.2f / 16f }

    /* ---------------- shapes ---------------- */

    private val tileRect = RectF(-TILE / 2f, -TILE / 2f, TILE / 2f, TILE / 2f)
    private val tileClip = Path().apply { addRoundRect(tileRect, TILE_R, TILE_R, Path.Direction.CW) }
    private val ringRect = RectF(-RING_R, -RING_R, RING_R, RING_R)
    private val pillRect = RectF(0f, 0f, PILL_W, PILL_H)
    private val tmpRect = RectF()

    // 24 × 24 line icons
    private val icons = arrayOf(
        PathParser.createPathFromPathData("M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 11h1.5a2.5 2.5 0 0 1 0 5H17"),
        PathParser.createPathFromPathData("M17 7L7 17 M17 17H7V7"),
        PathParser.createPathFromPathData("M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"),
    )
    private val checkPath = PathParser.createPathFromPathData("M5 12.5l4.5 4.5L19 7.5")

    init {
        contentDescription = "Regent Money, from RAO Dev Studios"
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        // Parse glyph paths and decode the logo before the first frame.
        WordmarkGlyphs.ONE_LINE.size
        logo = try {
            BitmapFactory.decodeResource(resources, R.drawable.intro_logo, BitmapFactory.Options().apply { inScaled = false })
        } catch (e: Exception) {
            null
        }
    }

    /* =================================================================== */
    /* Clock                                                               */
    /* =================================================================== */

    /** Starts the intro. [onFinish] fires exactly once, on the main thread. */
    fun start(onFinish: () -> Unit) {
        this.onFinish = onFinish
        clock = 0f
        holdMs = 0f
        waitingForApp = false
        isDismissing = false
        exitProgress = 0f
        alpha = 1f
        reduceMotion = reduceMotionEnabled()
        if (reduceMotion) {
            // Straight to the finished logo, shown for a moment.
            clock = B.HOLD
            holdMs = 1200f
        }
        running = true
        paused = false
        lastFrameNanos = 0L
        val choreographer = Choreographer.getInstance()
        choreographer.removeFrameCallback(frameCallback)
        choreographer.postFrameCallback(frameCallback)
        invalidate()
    }

    /** Called when React Native signals that its initial screen has rendered. */
    fun notifyAppReady() {
        post {
            isAppReady = true
            if (waitingForApp && !isDismissing) {
                waitingForApp = false
                dismiss()
            }
        }
    }

    /** Jumps straight to the finished logo and waits for React Native readiness. */
    fun skip() {
        if (isDismissing) return
        holdMs = 0f
        if (isAppReady) {
            dismiss()
        } else {
            clock = B.HOLD
            waitingForApp = true
            invalidate()
        }
    }

    /** Plays the exit (tile zooms up, everything fades) into React Native, then finishes. */
    fun dismiss() {
        if (isDismissing) return
        isDismissing = true
        running = false
        waitingForApp = false
        val choreographer = Choreographer.getInstance()
        choreographer.removeFrameCallback(frameCallback)
        exitStartNanos = 0L
        exitProgress = 0f
        choreographer.postFrameCallback(exitCallback)
    }

    private fun onExitFrame(frameTimeNanos: Long) {
        if (exitStartNanos == 0L) exitStartNanos = frameTimeNanos
        val duration = if (reduceMotion) 220f else B.EXIT_MS
        exitProgress = ((frameTimeNanos - exitStartNanos) / 1_000_000f / duration).coerceIn(0f, 1f)
        invalidate()
        if (exitProgress >= 1f) {
            val cb = onFinish
            onFinish = null
            cb?.invoke()
        } else {
            Choreographer.getInstance().postFrameCallback(exitCallback)
        }
    }

    /** Freeze the clock while the activity is in the background. */
    fun pause() {
        if (!running || paused) return
        paused = true
        Choreographer.getInstance().removeFrameCallback(frameCallback)
    }

    fun resume() {
        if (!running || !paused) return
        paused = false
        lastFrameNanos = 0L
        Choreographer.getInstance().postFrameCallback(frameCallback)
    }

    private fun onFrame(frameTimeNanos: Long) {
        if (!running || paused || isDismissing) return
        if (lastFrameNanos != 0L) {
            // Clamp single hitches (e.g. while the RN engine warms up) so they don't eat the opening.
            var dt = ((frameTimeNanos - lastFrameNanos) / 1_000_000f).coerceIn(0f, MAX_FRAME_STEP_MS)
            if (holdMs > 0f) {
                val used = min(holdMs, dt)
                holdMs -= used
                dt -= used
            }

            val nextClock = clock + dt
            if (nextClock >= B.HOLD) {
                clock = B.HOLD
                invalidate()
                if (holdMs > 0f) {
                    lastFrameNanos = frameTimeNanos
                    Choreographer.getInstance().postFrameCallback(frameCallback)
                    return
                }
                if (isAppReady) dismiss() else waitingForApp = true
                return
            }
            clock = nextClock
        }
        lastFrameNanos = frameTimeNanos
        invalidate()
        Choreographer.getInstance().postFrameCallback(frameCallback)
    }

    override fun onDetachedFromWindow() {
        running = false
        val choreographer = Choreographer.getInstance()
        choreographer.removeFrameCallback(frameCallback)
        choreographer.removeFrameCallback(exitCallback)
        super.onDetachedFromWindow()
    }

    private fun reduceMotionEnabled(): Boolean = try {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    } catch (e: Exception) {
        false
    }

    /* =================================================================== */
    /* Layout                                                              */
    /* =================================================================== */

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w == 0 || h == 0) return
        timeline = IntroTimeline(IntroLayout(w / density, h / density))
        glow = RadialGradient(
            0f, 0f, GLOW_R,
            intArrayOf(withAlpha(LIME, 0.35f), withAlpha(LIME, 0.12f), withAlpha(LIME, 0f)),
            floatArrayOf(0f, 0.35f, 0.65f),
            Shader.TileMode.CLAMP,
        )
        sheenShader = LinearGradient(
            -30f, 0f, 30f, 0f,
            intArrayOf(Color.TRANSPARENT, Color.argb(42, 255, 255, 255), Color.TRANSPARENT),
            null,
            Shader.TileMode.CLAMP,
        )
    }

    /* =================================================================== */
    /* Drawing                                                             */
    /* =================================================================== */

    override fun onDraw(canvas: Canvas) {
        val tl = timeline
        val exitA = 1f - inCubic(exitProgress)
        if (exitA <= 0.002f) return
        val fading = exitA < 0.998f
        if (fading) canvas.saveLayerAlpha(null, alpha255(exitA))

        canvas.drawColor(BG)
        if (tl != null) {
            val t = clock
            canvas.save()
            canvas.scale(density, density)
            drawRings(canvas, tl.L)
            drawGlow(canvas, tl, t)
            drawRing(canvas, tl, t)
            drawHalo(canvas, tl, t)
            drawTile(canvas, tl, t)
            drawPills(canvas, tl, t)
            drawWordmark(canvas, tl, t)
            drawFooter(canvas, tl, t)
            canvas.restore()
        }

        if (fading) canvas.restore()
    }

    /** Faint forest rings in the corners, the motif used across the app. */
    private fun drawRings(canvas: Canvas, L: IntroLayout) {
        stroke.strokeWidth = 1f
        stroke.color = withAlpha(FOREST, 0.08f)
        canvas.drawCircle(L.W - 20f, 10f, 180f, stroke)
        canvas.drawCircle(L.W - 40f, 20f, 100f, stroke)
        canvas.drawCircle(-20f, L.H - 20f, 150f, stroke)
    }

    private fun drawGlow(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val o = tl.glowOpacity.at(t)
        if (o <= 0.002f) return
        val s = tl.glowScale.at(t)
        canvas.save()
        canvas.translate(tl.L.cx, tl.L.cy)
        canvas.scale(s, s)
        glowPaint.shader = glow
        glowPaint.alpha = alpha255(o)
        canvas.drawCircle(0f, 0f, GLOW_R, glowPaint)
        canvas.restore()
    }

    private fun drawRing(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val o = tl.ringOpacity.at(t)
        if (o <= 0.002f) return
        canvas.save()
        canvas.translate(tl.L.cx, tl.L.cy)
        stroke.strokeWidth = 2f
        stroke.color = withAlpha(LINE, o)
        canvas.drawCircle(0f, 0f, RING_R, stroke)
        val sweep = tl.ringSweep.at(t) * 360f
        if (sweep > 0.5f) {
            stroke.color = withAlpha(FOREST, o)
            canvas.drawArc(ringRect, -90f, sweep, false, stroke)
        }
        canvas.restore()
    }

    private fun drawHalo(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val o = tl.haloOpacity.at(t)
        if (o <= 0.002f) return
        val s = tl.haloScale.at(t)
        canvas.save()
        canvas.translate(tl.L.cx, tl.L.cy)
        canvas.scale(s, s)
        stroke.strokeWidth = 1.5f / s
        stroke.color = withAlpha(FOREST, o)
        canvas.drawRoundRect(tileRect, TILE_R, TILE_R, stroke)
        canvas.restore()
    }

    private fun drawTile(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val o = tl.tileOpacity.at(t)
        if (o <= 0.002f) return
        val s = tl.tileScale.at(t) * (1f + 0.35f * outCubic(exitProgress))
        canvas.save()
        canvas.translate(tl.L.cx, tl.L.cy)
        canvas.scale(s, s)
        val layered = o < 0.998f
        if (layered) canvas.saveLayerAlpha(-TILE, -TILE, TILE, TILE + 24f, alpha255(o))

        canvas.drawRoundRect(tileRect, TILE_R, TILE_R, tileShadowPaint)
        canvas.save()
        canvas.clipPath(tileClip)
        logo?.let { bmp -> canvas.drawBitmap(bmp, null, tileRect, bitmapPaint) }
        // light band sweeping across the tile
        val p = tl.sheen.at(t)
        if (p > -0.999f && p < 0.999f) {
            canvas.save()
            canvas.translate(p * (TILE / 2f + 40f), 0f)
            canvas.skew(-0.32f, 0f)
            sheenPaint.shader = sheenShader
            canvas.drawRect(-30f, -TILE, 30f, TILE, sheenPaint)
            canvas.restore()
        }
        canvas.restore()

        if (layered) canvas.restore()
        canvas.restore()
    }

    private fun drawPills(canvas: Canvas, tl: IntroTimeline, t: Float) {
        for (pill in tl.pills) {
            val o = pill.opacity.at(t)
            if (o <= 0.002f) continue
            val s = pill.scale.at(t)
            canvas.save()
            canvas.translate(pill.homeX + pill.dx.at(t), pill.homeY + pill.dy.at(t))
            canvas.scale(s, s)
            canvas.translate(-PILL_W / 2f, -PILL_H / 2f)
            val layered = o < 0.998f
            if (layered) canvas.saveLayerAlpha(-20f, -20f, PILL_W + 20f, PILL_H + 28f, alpha255(o))
            drawPill(canvas, pill, pill.tick.at(t))
            if (layered) canvas.restore()
            canvas.restore()
        }
    }

    private fun drawPill(canvas: Canvas, pill: PillTracks, tick: Float) {
        val r = PILL_H / 2f
        canvas.drawRoundRect(pillRect, r, r, pillPaint)
        stroke.strokeWidth = 1f
        stroke.color = LINE
        tmpRect.set(0.5f, 0.5f, PILL_W - 0.5f, PILL_H - 0.5f)
        canvas.drawRoundRect(tmpRect, r - 0.5f, r - 0.5f, stroke)

        // icon bubble
        fill.color = MIST
        canvas.drawCircle(6f + 16f, r, 16f, fill)
        canvas.save()
        canvas.translate(22f - 7.5f, r - 7.5f)
        canvas.scale(15f / 24f, 15f / 24f)
        stroke.strokeWidth = 2f * 24f / 15f
        stroke.color = FOREST
        canvas.drawPath(icons[pill.icon], stroke)
        canvas.restore()

        labelPaint.color = INK
        canvas.drawText(pill.label, 46f, centeredBaseline(labelPaint, r), labelPaint)
        amountPaint.color = if (pill.credit) GREEN else INK
        canvas.drawText(pill.amount, PILL_W - 14f, centeredBaseline(amountPaint, r), amountPaint)

        // lime tick badge on the top-right corner
        if (tick > 0.01f) {
            canvas.save()
            canvas.translate(PILL_W - 4f, 3f)
            canvas.scale(tick, tick)
            fill.color = BG
            canvas.drawCircle(0f, 0f, 12f, fill)
            fill.color = FOREST
            canvas.drawCircle(0f, 0f, 10f, fill)
            canvas.translate(-5f, -5f)
            canvas.scale(10f / 24f, 10f / 24f)
            stroke.strokeWidth = 3.5f
            stroke.color = LIME
            canvas.drawPath(checkPath, stroke)
            canvas.restore()
        }
    }

    /** "Regent Money" on one line, each traced glyph rising out of the baseline. */
    private fun drawWordmark(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val L = tl.L
        val S = L.S
        canvas.save()
        canvas.translate(L.wordLeft, L.wordTop)
        canvas.clipRect(-4f, -4f, L.wordW + 4f, WordmarkGlyphs.ONE_LINE_H * S + 2f)
        val glyphs = WordmarkGlyphs.ONE_LINE
        for (i in glyphs.indices) {
            val tr = tl.glyphs[i]
            val o = tr.opacity.at(t)
            if (o <= 0.002f) continue
            val g = glyphs[i]
            canvas.save()
            canvas.translate(0f, tr.y.at(t))
            canvas.scale(S, S)
            canvas.translate(g.dx, g.dy)
            fill.color = withAlpha(if (g.money) GREEN else INK, o)
            canvas.drawPath(g.glyph.path, fill)
            canvas.restore()
        }
        canvas.restore()

        // green notch in the R and leaf on the t, popping in once the word has risen
        val a = tl.accentScale.at(t)
        if (a > 0.001f) {
            canvas.save()
            canvas.translate(L.wordLeft, L.wordTop)
            fill.color = GREEN
            for (g in arrayOf(WordmarkGlyphs.NOTCH, WordmarkGlyphs.LEAF)) {
                val pivX = g.x * S
                val pivY = (g.y + g.h) * S
                canvas.save()
                canvas.scale(a, a, pivX, pivY)
                canvas.scale(S, S)
                canvas.drawPath(g.path, fill)
                canvas.restore()
            }
            canvas.restore()
        }
    }

    private fun drawFooter(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val o = tl.footerOpacity.at(t)
        if (o <= 0.002f) return
        val L = tl.L
        val dy = tl.footerY.at(t)
        val studioBaseline = L.H - L.footerBottom - studioPaint.descent() + dy
        val fromBaseline = studioBaseline + studioPaint.ascent() - 2f - fromPaint.descent()
        fromPaint.color = withAlpha(BODY, o)
        studioPaint.color = withAlpha(INK, o)
        canvas.drawText("from", L.W / 2f, fromBaseline, fromPaint)
        canvas.drawText("RAO Dev Studios", L.W / 2f, studioBaseline, studioPaint)
    }

    /* =================================================================== */
    /* Helpers                                                             */
    /* =================================================================== */

    private fun textPaint(sizeDp: Float, weight: Int, color: Int, align: Paint.Align) =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = sizeDp // canvas is already scaled to dp
            typeface = typefaceFor(weight)
            this.color = color
            textAlign = align
        }

    private fun typefaceFor(weight: Int): Typeface = when {
        Build.VERSION.SDK_INT >= 28 -> Typeface.create(Typeface.DEFAULT, weight, false)
        weight >= 600 -> Typeface.DEFAULT_BOLD
        else -> Typeface.DEFAULT
    }

    private fun centeredBaseline(p: Paint, centerY: Float) = centerY - (p.ascent() + p.descent()) / 2f

    private fun alpha255(a: Float) = (a.coerceIn(0f, 1f) * 255f).roundToInt()

    private fun withAlpha(color: Int, a: Float): Int =
        (color and 0x00FFFFFF) or (alpha255(a * (Color.alpha(color) / 255f)) shl 24)

    companion object {
        const val MAX_FRAME_STEP_MS = 100f
        const val GLOW_R = 160f
    }
}
