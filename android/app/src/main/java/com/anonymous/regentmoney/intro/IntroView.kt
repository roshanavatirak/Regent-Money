package com.anonymous.regentmoney.intro

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Build
import android.provider.Settings
import android.util.AttributeSet
import android.view.Choreographer
import android.view.View
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Native port of src/components/RegentIntro.tsx.
 *
 * Everything is drawn on one Canvas in dp units (the canvas is scaled by density),
 * driven by a single 0 → 5000 ms clock. The clock runs off Choreographer frame
 * times rather than a ValueAnimator so it is NOT affected by the system
 * "animator duration scale" (a ValueAnimator would jump straight to the end when
 * animations are turned off, and the intro would just vanish).
 */
class IntroView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    /* ---------------- brand ---------------- */

    private val BG = Color.parseColor("#fafbfc")
    private val WHITE = Color.WHITE
    private val GREEN = Color.parseColor("#2dba4e")
    private val GREEN_DEEP = Color.parseColor("#1f8f3a")
    private val MIST = Color.parseColor("#e7f7eb")
    private val INK = Color.parseColor("#1c252e")
    private val MUTED = Color.parseColor("#7b8794")

    private class Chip(val label: String, val amount: String, val credit: Boolean)

    private val chipData = listOf(
        Chip("Coffee", "−₹180", false),
        Chip("Salary", "+₹52,000", true),
        Chip("Rent", "−₹15,000", false),
    )

    /* ---------------- state ---------------- */

    private val density = resources.displayMetrics.density
    private var timeline: IntroTimeline? = null

    private var blobSize = 0f
    private var haloSize = 0f
    private var glowA: Shader? = null
    private var glowB: Shader? = null
    private var halo: Shader? = null

    private var clock = 0f
    private var holdMs = 0f
    private var lastFrameNanos = 0L
    private var running = false
    private var paused = false
    private var isAppReady = false
    private var waitingForApp = false
    private var isDismissing = false
    private var onFinish: (() -> Unit)? = null
    private val frameCallback = Choreographer.FrameCallback { now -> onFrame(now) }

    /* ---------------- paints (allocated once) ---------------- */

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val chipBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = WHITE
        // Approximates the RN chip's elevation: 6 (honoured on hardware canvases from API 28).
        setShadowLayer(10f, 0f, 4f, withAlpha(INK, 0.16f))
    }
    private val rupeePaint = textPaint(14f, 800, GREEN, Paint.Align.CENTER)
    private val labelPaint = textPaint(14f, 700, INK, Paint.Align.LEFT)
    private val amountPaint = textPaint(14f, 800, INK, Paint.Align.RIGHT)
    private val fromPaint = textPaint(12f, 400, MUTED, Paint.Align.CENTER).apply { letterSpacing = 0.3f / 12f }
    private val studioPaint = textPaint(15f, 700, INK, Paint.Align.CENTER).apply { letterSpacing = 0.2f / 15f }

    private val chipLayerBounds = RectF(-24f, -24f, CHIP_W + 24f, CHIP_H + 32f)

    /* ---------------- agent shapes (agent box is 60 × 72) ---------------- */

    private val bodyClip = Path().apply { addCircle(24f, 24f, 24f, Path.Direction.CW) }

    // sprout leaf: 12 × 7 at (30, 7), radii TL 7, TR 1, BR 7, BL 1
    private val sproutLeafPath = Path().apply {
        addRoundRect(
            RectF(30f, 7f, 42f, 14f),
            floatArrayOf(7f, 7f, 1f, 1f, 7f, 7f, 1f, 1f),
            Path.Direction.CW,
        )
    }

    // smile: 11 × 6 box at (18.5, 28) in body space, 2.4 border with no top edge, bottom radii 5.5
    private val smilePath = Path().apply {
        moveTo(19.7f, 28f)
        lineTo(19.7f, 28.5f)
        arcTo(RectF(19.7f, 24.2f, 28.3f, 32.8f), 180f, -180f, false)
        lineTo(28.3f, 28f)
    }

    init {
        contentDescription = "Regent Money, from RAO Dev Studios"
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        // Touch the glyph object now so path parsing happens before the first frame.
        WordmarkGlyphs.REGENT.size
    }

    /* =================================================================== */
    /* Clock                                                               */
    /* =================================================================== */

    /** Starts the 5 s intro. [onFinish] fires exactly once, on the main thread. */
    fun start(onFinish: () -> Unit) {
        this.onFinish = onFinish
        clock = 0f
        holdMs = 0f
        waitingForApp = false
        isDismissing = false
        alpha = 1f
        if (reduceMotionEnabled()) {
            clock = HOLD_AT_MS
            holdMs = 4000f
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
            clock = HOLD_AT_MS
            waitingForApp = true
            invalidate()
        }
    }

    /** Smoothly crossfades out the native intro overlay directly into React Native. */
    fun dismiss() {
        if (isDismissing) return
        isDismissing = true
        running = false
        waitingForApp = false
        Choreographer.getInstance().removeFrameCallback(frameCallback)

        animate()
            .alpha(0f)
            .setDuration(280L)
            .withEndAction {
                val cb = onFinish
                onFinish = null
                cb?.invoke()
            }
            .start()
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
            if (nextClock >= HOLD_AT_MS) {
                clock = HOLD_AT_MS
                invalidate()
                if (isAppReady) {
                    dismiss()
                } else {
                    waitingForApp = true
                }
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
        Choreographer.getInstance().removeFrameCallback(frameCallback)
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
        val layout = IntroLayout(w / density, h / density)
        timeline = IntroTimeline(layout)
        blobSize = layout.W * 1.5f
        haloSize = layout.logoW * 1.8f
        glowA = glowShader(blobSize, 0.10f)
        glowB = glowShader(blobSize, 0.08f)
        halo = glowShader(haloSize, 0.16f)
    }

    private fun glowShader(size: Float, strength: Float): Shader = RadialGradient(
        size / 2f, size / 2f, size / 2f,
        intArrayOf(withAlpha(GREEN, strength), withAlpha(GREEN, strength * 0.35f), withAlpha(GREEN, 0f)),
        floatArrayOf(0f, 0.55f, 1f),
        Shader.TileMode.CLAMP,
    )

    /* =================================================================== */
    /* Drawing                                                             */
    /* =================================================================== */

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(BG)
        val tl = timeline ?: return
        val t = clock
        val exitA = tl.exitOpacity.at(t)
        if (exitA <= 0.002f) return

        canvas.save()
        canvas.scale(density, density)
        canvas.translate(0f, tl.exitY.at(t))
        val fading = exitA < 0.998f
        if (fading) canvas.saveLayerAlpha(null, alpha255(exitA))

        drawAmbient(canvas, tl, t)
        val L = tl.L
        drawGlow(
            canvas, halo, haloSize,
            L.W / 2f - haloSize / 2f, L.top + L.logoH / 2f - haloSize / 2f,
            tl.haloOpacity.at(t), tl.haloScale.at(t),
        )
        drawShadowAndPuffs(canvas, tl, t)
        drawLogo(canvas, tl, t)
        drawChips(canvas, tl, t)
        drawSparkles(canvas, tl, t)
        drawAgent(canvas, tl, t)
        drawFooter(canvas, tl, t)

        if (fading) canvas.restore()
        canvas.restore()
    }

    /* ---------------- background light ---------------- */

    private fun drawAmbient(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val a = tl.ambientOpacity.at(t)
        if (a <= 0.002f) return
        val L = tl.L
        val dA = tl.driftA.at(t)
        val dB = tl.driftB.at(t)
        drawGlow(canvas, glowA, blobSize, -blobSize * 0.55f + dA, -blobSize * 0.5f + dA, a, 1f)
        drawGlow(canvas, glowB, blobSize, L.W - blobSize * 0.45f + dB, L.H - blobSize * 0.45f + dB, a, 1f)
    }

    private fun drawGlow(
        canvas: Canvas, shader: Shader?, size: Float,
        left: Float, top: Float, opacity: Float, scale: Float,
    ) {
        if (shader == null || opacity <= 0.002f || scale <= 0f) return
        canvas.save()
        canvas.translate(left, top)
        if (scale != 1f) canvas.scale(scale, scale, size / 2f, size / 2f)
        glowPaint.shader = shader
        glowPaint.alpha = alpha255(opacity)
        canvas.drawRect(0f, 0f, size, size, glowPaint)
        canvas.restore()
    }

    /* ---------------- ground shadow & puffs ---------------- */

    private fun drawShadowAndPuffs(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val L = tl.L
        val so = tl.shadowOpacity.at(t)
        if (so > 0.002f) {
            canvas.save()
            canvas.scale(tl.shadowScale.at(t), 1f, L.groundX, L.groundY)
            fill.color = withAlpha(INK, 0.12f * so)
            canvas.drawRoundRect(
                L.groundX - SHADOW_W / 2f, L.groundY - 6f,
                L.groundX + SHADOW_W / 2f, L.groundY + 6f,
                6f, 6f, fill,
            )
            canvas.restore()
        }
        for (p in tl.puffs) {
            val o = p.opacity.at(t)
            if (o <= 0.002f) continue
            fill.color = withAlpha(INK, 0.06f * o)
            canvas.drawCircle(
                p.x + p.dx.at(t),
                p.y - p.size / 2f + p.dy.at(t),
                p.size / 2f * p.scale.at(t),
                fill,
            )
        }
    }

    /* ---------------- wordmark ---------------- */

    private fun drawLogo(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val L = tl.L
        val S = L.S
        val dip = tl.dip.at(t)

        canvas.save()
        canvas.translate(L.left, L.top)

        drawWord(
            canvas, WordmarkGlyphs.REGENT, tl.regent,
            WordmarkGlyphs.REGENT_CLIP_TOP, WordmarkGlyphs.REGENT_CLIP_H, INK, L, dip, t,
        )
        drawWord(
            canvas, WordmarkGlyphs.MONEY, tl.money,
            WordmarkGlyphs.MONEY_CLIP_TOP, WordmarkGlyphs.MONEY_CLIP_H, GREEN, L, dip, t,
        )

        // Notch inside the R: scales from its bottom-left corner.
        val ns = tl.notchScale.at(t)
        val no = tl.notchOpacity.at(t)
        if (ns > 0.001f && no > 0.002f) {
            val g = WordmarkGlyphs.NOTCH
            val pivX = g.x * S
            val pivY = (g.y + g.h) * S
            canvas.save()
            canvas.scale(ns, ns, pivX, pivY)
            canvas.scale(S, S)
            fill.color = withAlpha(GREEN, no)
            canvas.drawPath(g.path, fill)
            canvas.restore()
        }

        // Leaf on the t: rotates + scales from its bottom-left corner and rides the dip.
        val ls = tl.leafScale.at(t)
        val lo = tl.leafOpacity.at(t)
        if (ls > 0.001f && lo > 0.002f) {
            val g = WordmarkGlyphs.LEAF
            val pivX = g.x * S
            val pivY = (g.y + g.h) * S
            canvas.save()
            canvas.translate(0f, dip * 0.3f)
            canvas.rotate(tl.leafRotate.at(t), pivX, pivY)
            canvas.scale(ls, ls, pivX, pivY)
            canvas.scale(S, S)
            fill.color = withAlpha(GREEN, lo)
            canvas.drawPath(g.path, fill)
            canvas.restore()
        }

        canvas.restore()
    }

    private fun drawWord(
        canvas: Canvas,
        glyphs: List<Glyph>,
        tracks: List<GlyphTracks>,
        clipTop: Float,
        clipH: Float,
        color: Int,
        L: IntroLayout,
        dip: Float,
        t: Float,
    ) {
        val S = L.S
        canvas.save()
        canvas.clipRect(0f, clipTop * S, L.logoW, (clipTop + clipH) * S)
        for (i in glyphs.indices) {
            val tr = tracks[i]
            val o = tr.opacity.at(t)
            if (o <= 0.002f) continue
            canvas.save()
            canvas.translate(0f, tr.y.at(t) + dip * tr.dipWeight)
            canvas.scale(S, S)
            fill.color = withAlpha(color, o)
            canvas.drawPath(glyphs[i].path, fill)
            canvas.restore()
        }
        canvas.restore()
    }

    /* ---------------- bank-SMS chips ---------------- */

    private fun drawChips(canvas: Canvas, tl: IntroTimeline, t: Float) {
        for (i in tl.chips.indices) {
            val c = tl.chips[i]
            val o = c.opacity.at(t)
            if (o <= 0.002f) continue
            val s = c.scale.at(t)
            canvas.save()
            // RN rotates/scales around the view centre
            canvas.translate(c.x.at(t) + CHIP_W / 2f, c.y.at(t) + CHIP_H / 2f)
            canvas.rotate(c.rotate.at(t))
            canvas.scale(s, s)
            canvas.translate(-CHIP_W / 2f, -CHIP_H / 2f)
            val layered = o < 0.998f
            if (layered) canvas.saveLayerAlpha(chipLayerBounds, alpha255(o))
            drawChip(canvas, chipData[i])
            if (layered) canvas.restore()
            canvas.restore()
        }
    }

    private fun drawChip(canvas: Canvas, chip: Chip) {
        val r = CHIP_H / 2f
        canvas.drawRoundRect(0f, 0f, CHIP_W, CHIP_H, r, r, chipBgPaint)

        stroke.strokeWidth = 1f
        stroke.color = withAlpha(INK, 0.06f)
        canvas.drawRoundRect(0.5f, 0.5f, CHIP_W - 0.5f, CHIP_H - 0.5f, r - 0.5f, r - 0.5f, stroke)

        // ₹ icon: 26 × 26 circle, 8 from the left
        fill.color = MIST
        canvas.drawCircle(21f, r, 13f, fill)
        canvas.drawText("₹", 21f, centeredBaseline(rupeePaint, r), rupeePaint)

        canvas.drawText(chip.label, 43f, centeredBaseline(labelPaint, r), labelPaint)

        amountPaint.color = if (chip.credit) GREEN else INK
        canvas.drawText(chip.amount, CHIP_W - 14f, centeredBaseline(amountPaint, r), amountPaint)
    }

    /* ---------------- sparkles ---------------- */

    private fun drawSparkles(canvas: Canvas, tl: IntroTimeline, t: Float) {
        fill.color = GREEN
        for (s in tl.sparkles) {
            val sc = s.scale.at(t)
            if (sc <= 0.001f) continue
            val k = sc * s.size / 24f
            canvas.save()
            canvas.translate(s.x, s.y)
            canvas.rotate(s.rotate.at(t))
            canvas.scale(k, k)
            canvas.translate(-12f, -12f)
            canvas.drawPath(WordmarkGlyphs.SPARKLE, fill)
            canvas.restore()
        }
    }

    /* ---------------- the money agent ---------------- */

    private fun drawAgent(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val cx = CW / 2f
        val size = tl.size.at(t)

        canvas.save()
        canvas.translate(tl.agentX.at(t), tl.agentY(t))
        // size, tilt and squash pivot on the feet; the flip spins around the middle
        canvas.scale(size, size, cx, CH)
        canvas.rotate(tl.flip.at(t), cx, CH / 2f)
        canvas.rotate(tl.tilt.at(t), cx, CH)
        canvas.scale(tl.scaleX(t), tl.scaleY(t), cx, CH)

        // arms (pivot at the shoulder = top centre of each 6 × 18 arm)
        fill.color = GREEN_DEEP
        drawArm(canvas, 6f, tl.armL.at(t))
        drawArm(canvas, 48f, tl.armR.at(t))

        // feet
        canvas.drawRoundRect(16f, 66f, 29f, 72f, 3f, 3f, fill)
        canvas.drawRoundRect(31f, 66f, 44f, 72f, 3f, 3f, fill)

        // sprout (pivot at the bottom of the stem)
        canvas.save()
        canvas.rotate(tl.sprout.at(t), 30f, 22f)
        canvas.drawRoundRect(28.5f, 12f, 31.5f, 22f, 1.5f, 1.5f, fill)
        canvas.rotate(-25f, 36f, 10.5f)
        canvas.drawPath(sproutLeafPath, fill)
        canvas.restore()

        // body (48 × 48 coin at 6, 20; children are clipped to it)
        canvas.save()
        canvas.translate(6f, 20f)
        canvas.clipPath(bodyClip)

        fill.color = GREEN
        canvas.drawCircle(24f, 24f, 24f, fill)

        stroke.strokeWidth = 1.5f
        stroke.color = withAlpha(WHITE, 0.3f)
        canvas.drawCircle(24f, 24f, 18.25f, stroke)

        canvas.save()
        canvas.rotate(-30f, 15f, 9f)
        fill.color = withAlpha(WHITE, 0.45f)
        canvas.drawRoundRect(9f, 6f, 21f, 12f, 3f, 3f, fill)
        canvas.restore()

        val blink = tl.blink.at(t)
        val lx = tl.lookX.at(t)
        val ly = tl.lookY.at(t)
        drawEye(canvas, 11f, blink, lx, ly)
        drawEye(canvas, 26f, blink, lx, ly)

        fill.color = withAlpha(WHITE, 0.3f)
        canvas.drawRoundRect(6f, 29f, 13f, 33f, 2f, 2f, fill)
        canvas.drawRoundRect(35f, 29f, 42f, 33f, 2f, 2f, fill)

        val mouth = tl.mouth.at(t).coerceIn(0f, 1f)
        if (mouth < 0.998f) {
            stroke.strokeWidth = 2.4f
            stroke.color = withAlpha(INK, 1f - mouth)
            canvas.drawPath(smilePath, stroke)
        }
        if (mouth > 0.002f) {
            fill.color = withAlpha(INK, mouth)
            canvas.drawCircle(24f, 31.5f, 4f, fill)
        }

        canvas.restore() // body
        canvas.restore() // agent
    }

    private fun drawArm(canvas: Canvas, left: Float, deg: Float) {
        canvas.save()
        canvas.rotate(deg, left + 3f, 42f)
        canvas.drawRoundRect(left, 42f, left + 6f, 60f, 3f, 3f, fill)
        canvas.restore()
    }

    /** Eye: 11 × 12 at (left, 15) in body space; blink squashes it vertically around its centre. */
    private fun drawEye(canvas: Canvas, left: Float, blink: Float, lx: Float, ly: Float) {
        val ex = left + 5.5f
        val ey = 21f
        canvas.save()
        canvas.scale(1f, blink, ex, ey)

        fill.color = WHITE
        canvas.drawRoundRect(left, 15f, left + 11f, 27f, 5.5f, 5.5f, fill)

        val px = ex + lx
        val py = ey + ly
        fill.color = INK
        canvas.drawRoundRect(px - 2.75f, py - 3.25f, px + 2.75f, py + 3.25f, 2.75f, 2.75f, fill)

        fill.color = WHITE
        canvas.drawCircle(px - 2.75f + 2f, py - 3.25f + 2f, 1f, fill)
        canvas.restore()
    }

    /* ---------------- footer ---------------- */

    private fun drawFooter(canvas: Canvas, tl: IntroTimeline, t: Float) {
        val o = tl.footerOpacity.at(t)
        if (o <= 0.002f) return
        val L = tl.L
        val dy = tl.footerY.at(t)
        val studioBaseline = L.H - L.footerBottom - studioPaint.descent() + dy
        val fromBaseline = studioBaseline + studioPaint.ascent() - 2f - fromPaint.descent()

        fromPaint.color = withAlpha(MUTED, o)
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
        const val HOLD_AT_MS = 5000f
    }
}
