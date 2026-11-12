package com.regentmoney.intro

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/*
 * "Sorted" intro, the native version of the design-canvas board "Intro · new A · Sorted".
 *
 *   0.0s  forest app-icon tile pops in, a forest ring draws around it, soft lime glow
 *   0.7s  three transaction pills (Coffee, Salary, Rent) slide in and get a lime tick
 *   2.0s  each pill flies into the tile; the tile gives a little bounce per pill
 *   2.9s  a halo pulses out, "Regent Money" rises glyph by glyph (the traced wordmark)
 *   3.9s  hold here until React Native is ready, then IntroView plays the exit
 *
 * "from RAO Dev Studios" fades in at the start and stays to the very end.
 * All distances in dp (IntroView scales the canvas by density), times in ms.
 */

/* ------------------------------------------------------------------ */
/* Easing                                                             */
/* ------------------------------------------------------------------ */

typealias Ease = (Float) -> Float

private const val PI_F = PI.toFloat()

val linear: Ease = { p -> p }
val inQuad: Ease = { p -> p * p }
val outQuad: Ease = { p -> 1f - (1f - p) * (1f - p) }
val inCubic: Ease = { p -> p * p * p }
val outCubic: Ease = { p -> 1f - (1f - p).pow(3f) }
val inOutCubic: Ease = { p -> if (p < 0.5f) 4f * p * p * p else 1f - (-2f * p + 2f).pow(3f) / 2f }
val inOutSine: Ease = { p -> -(cos(PI_F * p) - 1f) / 2f }
val outExpo: Ease = { p -> if (p >= 1f) 1f else 1f - 2f.pow(-10f * p) }

fun outBack(s: Float = 1.7f): Ease = { p -> 1f + (s + 1f) * (p - 1f).pow(3f) + s * (p - 1f).pow(2f) }

/** Damped spring that still lands exactly on the target at p = 1. */
fun spring(bounces: Float = 2f, decay: Float = 6f): Ease {
    val end = 1f - exp(-decay) * cos(2f * PI_F * bounces)
    return { p -> (1f - exp(-decay * p) * cos(2f * PI_F * bounces * p)) / end }
}

/* ------------------------------------------------------------------ */
/* Keyframes                                                          */
/* ------------------------------------------------------------------ */

/** A keyframe. `ease` shapes the segment that ENDS at this key (null = linear). */
class Key(val ms: Float, val value: Float, val ease: Ease?)

fun k(ms: Number, value: Number, ease: Ease? = null) = Key(ms.toFloat(), value.toFloat(), ease)

/** Clamped keyframe track. */
class Track(keys: List<Key>) {
    private val ms = FloatArray(keys.size) { keys[it].ms }
    private val vs = FloatArray(keys.size) { keys[it].value }
    private val eases: Array<Ease> = Array(keys.size) { keys[it].ease ?: linear }

    fun at(t: Float): Float {
        if (t <= ms[0]) return vs[0]
        for (i in 1 until ms.size) {
            if (t <= ms[i]) {
                val span = ms[i] - ms[i - 1]
                if (span <= 0f) return vs[i]
                val p = (t - ms[i - 1]) / span
                return vs[i - 1] + (vs[i] - vs[i - 1]) * eases[i](p)
            }
        }
        return vs[vs.size - 1]
    }
}

fun track(vararg keys: Key) = Track(keys.asList())

/* ------------------------------------------------------------------ */
/* Key moments                                                        */
/* ------------------------------------------------------------------ */

object B {
    const val TILE_IN = 0f
    const val RING = 360f
    val PILL_IN = floatArrayOf(700f, 1000f, 1300f)
    val PILL_ABSORB = floatArrayOf(2000f, 2300f, 2600f) // each lands in the tile 320 ms later
    const val HALO = 2940f
    const val WORD = 3000f
    const val SHEEN = 3300f
    const val HOLD = 3900f // IntroView parks the clock here until React Native is ready
    const val EXIT_MS = 440f
}

const val TILE = 112f
const val TILE_R = 34f
const val RING_R = 74f
const val PILL_W = 172f
const val PILL_H = 44f

/* ------------------------------------------------------------------ */
/* Layout (dp)                                                        */
/* ------------------------------------------------------------------ */

class IntroLayout(val W: Float, val H: Float) {
    /** Tile centre, a little above the middle like the design (340 / 844). */
    val cx = W / 2f
    val cy = H * 0.40f

    /* One-line wordmark built from the two-line traced glyphs. */
    val wordUnitsW = WordmarkGlyphs.ONE_LINE_W
    val wordW = min(W * 0.62f, 236f)
    val S = wordW / wordUnitsW
    val wordH = WordmarkGlyphs.ONE_LINE_H * S
    val wordLeft = (W - wordW) / 2f
    val wordTop = cy + TILE / 2f + 40f

    val footerBottom = max(36f, H * 0.055f)
}

class PillTracks(
    val label: String,
    val amount: String,
    val credit: Boolean,
    val icon: Int,
    val homeX: Float,
    val homeY: Float,
    val dx: Track,
    val dy: Track,
    val scale: Track,
    val opacity: Track,
    val tick: Track,
)

class GlyphTracks(val y: Track, val opacity: Track)

/* ------------------------------------------------------------------ */
/* Timeline                                                           */
/* ------------------------------------------------------------------ */

class IntroTimeline(val L: IntroLayout) {

    /* --- tile ---------------------------------------------------------- */

    val tileOpacity = track(k(0, 0), k(B.TILE_IN + 300, 1, outCubic))

    private fun gulp(at: Float, peak: Float) = listOf(
        k(at, 1), k(at + 70, peak, outQuad), k(at + 300, 1, spring(1f, 5f)),
    )

    val tileScale = Track(
        listOf(
            k(0, 0.2f),
            k(540, 1.06f, outCubic),
            k(720, 1f, inOutSine),
        ) + gulp(B.PILL_ABSORB[0] + 320, 1.07f) +
            gulp(B.PILL_ABSORB[1] + 320, 1.07f) +
            gulp(B.PILL_ABSORB[2] + 320, 1.1f)
    )

    /** 0 → 1 sweep of the forest ring, then it fades once the logo is complete. */
    val ringSweep = track(k(0, 0), k(B.RING, 0), k(B.RING + 840, 1, inOutCubic))
    val ringOpacity = track(k(0, 1), k(2880, 1), k(3360, 0, outQuad))

    val glowOpacity = track(k(0, 0), k(240, 0), k(1200, 1, outCubic))
    val glowScale = track(k(0, 0.6f), k(240, 0.6f), k(1200, 1, outCubic))

    val haloScale = track(k(0, 1), k(B.HALO, 1), k(B.HALO + 900, 1.9f, outCubic))
    val haloOpacity = track(k(0, 0), k(B.HALO, 0), k(B.HALO + 120, 0.5f), k(B.HALO + 900, 0, outQuad))

    /** -1 → 1 position of the light band across the tile. */
    val sheen = track(k(0, -1), k(B.SHEEN, -1), k(B.SHEEN + 540, 1, inOutSine))

    /* --- pills --------------------------------------------------------- */

    val pills: List<PillTracks> = run {
        // label, amount, credit, icon, home offset from tile centre, entry offset
        val spec = listOf(
            arrayOf<Any>("Coffee", "−₹180", false, ICON_COFFEE, -85f, -169f, -230f, 0f),
            arrayOf<Any>("Salary", "+₹52,000", true, ICON_SALARY, 85f, -103f, 230f, 0f),
            arrayOf<Any>("Rent", "−₹15,000", false, ICON_RENT, 0f, 151f, 0f, 140f),
        )
        spec.mapIndexed { i, s ->
            val hx = s[4] as Float
            val hy = s[5] as Float
            val fx = s[6] as Float
            val fy = s[7] as Float
            val inAt = B.PILL_IN[i]
            val settled = inAt + 450f
            val absorb = B.PILL_ABSORB[i]
            val landed = absorb + 320f
            // flying into the tile means moving by -home offset
            PillTracks(
                label = s[0] as String,
                amount = s[1] as String,
                credit = s[2] as Boolean,
                icon = s[3] as Int,
                homeX = L.cx + hx,
                homeY = L.cy + hy,
                dx = track(k(0, fx), k(inAt, fx), k(settled, 0, outCubic), k(absorb, 0), k(landed, -hx, inOutCubic)),
                dy = track(k(0, fy), k(inAt, fy), k(settled, 0, outCubic), k(absorb, 0), k(landed, -hy, inOutCubic)),
                scale = track(k(0, 0.92f), k(inAt, 0.92f), k(settled, 1, outCubic), k(absorb, 1), k(landed, 0.15f, inOutCubic)),
                opacity = track(k(0, 0), k(inAt, 0), k(settled, 1, outCubic), k(absorb, 1), k(landed, 0, inQuad)),
                tick = track(k(0, 0), k(settled + 80f, 0), k(settled + 230f, 1.2f, outQuad), k(settled + 350f, 1, inOutSine)),
            )
        }
    }

    /* --- wordmark ------------------------------------------------------ */

    /**
     * Every letter of "Regent Money" rises out of its line, left to right, 35 ms apart.
     * Each starts a full line-height down, so it is hidden below the clip until it rises.
     */
    val glyphs: List<GlyphTracks> = (0 until WordmarkGlyphs.LETTER_COUNT).map { i ->
        val hide = L.wordH + 2f
        val start = B.WORD + i * 35f
        GlyphTracks(
            y = track(k(0, hide), k(start, hide), k(start + 520f, 0, outExpo)),
            opacity = track(k(0, 0), k(start, 0), k(start + 90f, 1)),
        )
    }

    val accentScale = track(k(0, 0), k(B.WORD + 420, 0), k(B.WORD + 680, 1, outBack(2.2f)))

    /* --- footer -------------------------------------------------------- */

    val footerOpacity = track(k(0, 0), k(180, 0), k(600, 1, outCubic))
    val footerY = track(k(0, 8), k(180, 8), k(600, 0, outCubic))

    companion object {
        const val ICON_COFFEE = 0
        const val ICON_SALARY = 1
        const val ICON_RENT = 2
    }
}
