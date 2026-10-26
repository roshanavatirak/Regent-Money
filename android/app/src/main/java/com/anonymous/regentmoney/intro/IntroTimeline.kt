package com.anonymous.regentmoney.intro

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/*
 * Port of the keyframe engine and timeline from src/components/RegentIntro.tsx.
 * All distances are in dp (IntroView scales the canvas by display density),
 * all angles in degrees, all times in ms on a single 0 → 5000 clock.
 *
 * Unlike the RN version (which pre-samples eased segments into lookup tables for
 * the native driver), tracks here evaluate the easing curve exactly each frame.
 */

/* ------------------------------------------------------------------ */
/* Key moments on the 5 s clock                                       */
/* ------------------------------------------------------------------ */

object B {
    const val DURATION = 5000f
    const val DROP = 100f
    const val LAND = 260f
    val CHIPS = floatArrayOf(1100f, 1750f, 2400f) // each transaction enters the agent
    const val CROUCH = 2520f
    const val TAKEOFF = 2680f
    const val REGENT = 2600f   // first letter of "Regent" starts rising
    const val MONEY = 2780f
    const val PERCH = 3160f    // lands on the "n" of Regent
    const val LEAF = 3220f
    const val NOTCH = 3300f
    val SPARKLES = floatArrayOf(3360f, 3460f, 3560f)
    const val WAVE = 3660f
    const val FOOTER = 3680f
    const val EXIT = 4400f
}

const val CW = 60f        // agent box
const val CH = 72f
const val JUMP_H = 110f
const val BIG = 1.7f      // agent is bigger on its own, then shrinks onto the logo
const val SHADOW_W = 76f
const val CHIP_W = 182f
const val CHIP_H = 42f

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

/** A keyframe. `ease` shapes the segment that ENDS at this key (null = linear), as in the JS. */
class Key(val ms: Float, val value: Float, val ease: Ease?)

fun k(ms: Number, value: Number, ease: Ease? = null) = Key(ms.toFloat(), value.toFloat(), ease)

/** Clamped keyframe track (extrapolate: 'clamp'). */
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
/* Layout (dp)                                                        */
/* ------------------------------------------------------------------ */

class IntroLayout(val W: Float, val H: Float) {
    val logoW = min(W * 0.59f, 240f)
    val S = logoW / WordmarkGlyphs.WM_W
    val logoH = WordmarkGlyphs.WM_H * S
    val left = (W - logoW) / 2f
    val top = H * 0.42f - logoH / 2f
    val groundX = W / 2f
    val groundY = top + logoH * 0.74f
    val perchX = left + WordmarkGlyphs.PERCH_X * S
    val perchY = top + WordmarkGlyphs.PERCH_Y * S
    val footerBottom = max(36f, H * 0.055f)
}

class ChipTracks(val x: Track, val y: Track, val scale: Track, val opacity: Track, val rotate: Track)
class GlyphTracks(val y: Track, val opacity: Track, val dipWeight: Float)
class SparkleTracks(val x: Float, val y: Float, val size: Float, val scale: Track, val rotate: Track)
class PuffTracks(
    val size: Float, val x: Float, val y: Float,
    val dx: Track, val dy: Track, val scale: Track, val opacity: Track,
)

/* ------------------------------------------------------------------ */
/* Timeline                                                           */
/* ------------------------------------------------------------------ */

class IntroTimeline(val L: IntroLayout) {

    /* --- the agent --------------------------------------------------- */

    private val gx = L.groundX - CW / 2f
    private val gy = L.groundY - CH
    private val px = L.perchX - CW / 2f
    private val py = L.perchY - CH
    private val apex = (B.TAKEOFF + B.PERCH) / 2f

    val size = track(k(0, BIG), k(B.TAKEOFF, BIG), k(B.PERCH, 0.8f, inOutCubic))

    /** The "n" sinks a little under the agent's weight, then springs back. */
    val dip = track(k(0, 0), k(B.PERCH, 0), k(B.PERCH + 50, 4, outQuad), k(B.PERCH + 380, 0, spring(1.5f, 5f)))

    private fun munch(at: Float) = listOf(
        k(at - 30, 0),
        k(at + 5, 0.45f, outQuad),
        k(at + 90, 0, spring(1f, 6f)),
    )

    /** > 0 squashes, < 0 stretches. */
    val squash = Track(
        listOf(
            k(0, 0),
            k(B.DROP, 0),
            k(B.LAND - 20, -0.4f, inQuad),
            k(B.LAND + 40, 1, outQuad),
            k(B.LAND + 350, 0, spring(2f, 6f)),
        ) + munch(B.CHIPS[0]) + munch(B.CHIPS[1]) + munch(B.CHIPS[2]) + listOf(
            k(B.CROUCH, 0),
            k(B.TAKEOFF, 0.8f, outCubic),
            k(B.TAKEOFF + 70, -0.5f, outQuad),
            k(B.TAKEOFF + 280, 0, inOutSine),
            k(B.PERCH, 0),
            k(B.PERCH + 40, 0.9f, outQuad),
            k(B.PERCH + 360, 0, spring(2f, 6f)),
            k(B.PERCH + 600, -0.05f, inOutSine),
            k(B.PERCH + 900, 0.04f, inOutSine),
            k(B.EXIT - 150, 0, inOutSine),
        )
    )

    val mouth = track(
        k(0, 0), k(100, 0), k(140, 1), k(350, 1), k(400, 0),
        k(B.CHIPS[0] - 120, 0), k(B.CHIPS[0] - 30, 1), k(B.CHIPS[0] + 80, 0),
        k(B.CHIPS[1] - 120, 0), k(B.CHIPS[1] - 30, 1), k(B.CHIPS[1] + 80, 0),
        k(B.CHIPS[2] - 120, 0), k(B.CHIPS[2] - 30, 1), k(B.CHIPS[2] + 80, 0),
        k(B.TAKEOFF + 40, 0), k(B.TAKEOFF + 90, 1), k(B.PERCH - 20, 1), k(B.PERCH + 50, 0),
        k(B.WAVE + 140, 0), k(B.WAVE + 180, 1), k(B.WAVE + 420, 1), k(B.WAVE + 460, 0),
    )

    val agentX = track(k(0, gx), k(B.TAKEOFF, gx), k(B.PERCH, px, linear))

    private val agentBaseY = track(
        k(0, -CH - 40), k(B.DROP, -CH - 40), k(B.LAND, gy, inQuad), k(B.TAKEOFF, gy), k(B.PERCH, py, linear),
    )
    private val agentJump = track(k(0, 0), k(B.TAKEOFF, 0), k(apex, -JUMP_H, outQuad), k(B.PERCH, 0, inQuad))

    fun agentY(t: Float) = agentBaseY.at(t) + agentJump.at(t) + dip.at(t)

    val flip = track(k(0, 0), k(B.TAKEOFF + 30, 0), k(B.PERCH - 30, 360, inOutCubic))

    val tilt = track(
        k(0, 0),
        k(450, 0), k(630, -7, outQuad), k(1020, -7), k(1100, 0, inOutSine),
        k(1280, 6, inOutSine), k(1670, 6), k(1750, 0, inOutSine),
        k(1930, -3, inOutSine), k(2320, -3), k(2400, 0, inOutSine),
        k(B.PERCH + 150, 0), k(B.PERCH + 250, -6, outQuad), k(B.PERCH + 380, -6), k(B.PERCH + 460, 0, inOutSine),
        k(B.WAVE + 120, 4, outQuad), k(B.WAVE + 500, 4), k(B.WAVE + 650, 0, inOutSine),
    )

    fun scaleX(t: Float) = 1f + 0.2f * squash.at(t)   // squash [-1, 1] → [0.8, 1.2]
    fun scaleY(t: Float) = 1f - 0.24f * squash.at(t)  // squash [-1, 1] → [1.24, 0.76]

    val armL = track(
        k(0, 150), k(B.LAND, 150), k(B.LAND + 200, 25, spring(1.5f, 5f)),
        k(B.CHIPS[0] - 180, 25), k(B.CHIPS[0] - 40, 95, outQuad), k(B.CHIPS[0] + 100, 25, outCubic),
        k(B.CHIPS[2] - 180, 25), k(B.CHIPS[2] - 40, 65, outQuad), k(B.CHIPS[2] + 100, 25, outCubic),
        k(B.CROUCH, 25), k(B.TAKEOFF, 10, outQuad), k(B.TAKEOFF + 70, 160, outQuad),
        k(B.PERCH - 80, 160), k(B.PERCH + 60, 85, outQuad), k(B.PERCH + 380, 25, spring(1.5f, 5f)),
    )

    val armR = track(
        k(0, -150), k(B.LAND, -150), k(B.LAND + 200, -25, spring(1.5f, 5f)),
        k(B.CHIPS[1] - 180, -25), k(B.CHIPS[1] - 40, -95, outQuad), k(B.CHIPS[1] + 100, -25, outCubic),
        k(B.CHIPS[2] - 180, -25), k(B.CHIPS[2] - 40, -65, outQuad), k(B.CHIPS[2] + 100, -25, outCubic),
        k(B.CROUCH, -25), k(B.TAKEOFF, -10, outQuad), k(B.TAKEOFF + 70, -160, outQuad),
        k(B.PERCH - 80, -160), k(B.PERCH + 60, -85, outQuad), k(B.PERCH + 380, -25, spring(1.5f, 5f)),
        // hello wave
        k(B.WAVE, -25), k(B.WAVE + 140, -150, outBack(1.6f)),
        k(B.WAVE + 240, -118, inOutSine), k(B.WAVE + 340, -160, inOutSine),
        k(B.WAVE + 440, -118, inOutSine), k(B.WAVE + 540, -160, inOutSine),
        k(B.WAVE + 680, -25, inOutCubic),
    )

    val sprout = track(
        k(0, 0), k(B.DROP, 0), k(B.LAND - 20, -14, inQuad), k(B.LAND + 50, 22, outQuad), k(B.LAND + 360, 0, spring(2f, 5f)),
        k(B.TAKEOFF, 0), k(B.TAKEOFF + 70, -20, outQuad), k(B.TAKEOFF + 280, 0, inOutSine),
        k(B.PERCH, 0), k(B.PERCH + 50, 24, outQuad), k(B.PERCH + 380, 0, spring(2f, 5f)),
        k(B.WAVE + 140, 0), k(B.WAVE + 340, 8, inOutSine), k(B.WAVE + 540, -6, inOutSine), k(B.WAVE + 680, 0, inOutSine),
    )

    val lookX = track(
        k(0, 0),
        k(450, 0), k(630, -2.6f, outQuad), k(1020, -2.6f), k(1100, 0, inOutSine),
        k(1280, 2.6f, inOutSine), k(1670, 2.6f), k(1750, 0, inOutSine),
        k(1930, 1.2f, inOutSine), k(2320, 1.2f), k(2400, 0, inOutSine),
        k(B.PERCH + 150, 0), k(B.PERCH + 250, -2.6f, outQuad), k(B.PERCH + 380, -2.6f), k(B.PERCH + 460, 0, inOutSine),
    )

    val lookY = track(
        k(0, 0), k(100, 0), k(200, 2, outQuad), k(350, 2), k(420, 0, outQuad),
        k(1750, 0), k(1950, -2.4f, inOutSine), k(2320, -2.4f), k(2400, 0, inOutSine),
        k(B.PERCH + 150, 0), k(B.PERCH + 250, 2, outQuad), k(B.PERCH + 380, 2), k(B.PERCH + 460, 0, inOutSine),
    )

    val blink = track(
        k(0, 1), k(B.LAND - 10, 1), k(B.LAND + 30, 0.15f, outQuad), k(B.LAND + 140, 1, outQuad),
        k(1200, 1), k(1240, 0.2f, inQuad), k(1320, 1, outQuad),
        k(B.CROUCH + 20, 1), k(B.CROUCH + 100, 0.45f, outQuad), k(B.CROUCH + 180, 1, outQuad),
        k(B.PERCH + 300, 1), k(B.PERCH + 350, 0.1f, inQuad), k(B.PERCH + 430, 1, outQuad),
        k(B.EXIT - 250, 1), k(B.EXIT - 200, 0.1f, inQuad), k(B.EXIT - 120, 1, outQuad),
    )

    /* --- transactions flying in ------------------------------------- */

    val chips: List<ChipTracks> = run {
        val mouthX = L.groundX
        val mouthY = L.groundY - 22f * BIG
        val from = arrayOf(
            floatArrayOf(-CHIP_W / 2f - 20f, L.groundY - 40f, -6f),
            floatArrayOf(L.W + CHIP_W / 2f + 20f, L.groundY - 140f, 8f),
            floatArrayOf(L.groundX + 40f, -CHIP_H - 20f, -4f),
        )
        val hover = arrayOf(
            floatArrayOf(L.groundX - 90f, L.groundY - 78f),  // chip 0 floats to the left
            floatArrayOf(L.groundX + 90f, L.groundY - 82f),  // chip 1 floats to the right
            floatArrayOf(L.groundX, L.groundY - 110f),       // chip 2 floats above
        )
        val starts = floatArrayOf(450f, 1100f, 1750f)

        List(3) { i ->
            val arrFrom = from[i]
            val fx = arrFrom[0]
            val fy = arrFrom[1]
            val tiltDeg = arrFrom[2]

            val arrHover = hover[i]
            val hx = arrHover[0]
            val hy = arrHover[1]

            val start = starts[i]
            val end = B.CHIPS[i]
            val arrive = start + 180f
            val hoverEnd = end - 160f
            ChipTracks(
                x = track(
                    k(0, fx - CHIP_W / 2f),
                    k(start, fx - CHIP_W / 2f),
                    k(arrive, hx - CHIP_W / 2f, outCubic),
                    k(hoverEnd, (hx + mouthX) / 2f - CHIP_W / 2f, linear),
                    k(end, mouthX - CHIP_W / 2f, inQuad),
                ),
                y = track(
                    k(0, fy - CHIP_H / 2f),
                    k(start, fy - CHIP_H / 2f),
                    k(arrive, hy - CHIP_H / 2f, outCubic),
                    k(hoverEnd, (hy + mouthY) / 2f - CHIP_H / 2f, inOutSine),
                    k(end, mouthY - CHIP_H / 2f, inQuad),
                ),
                scale = track(
                    k(0, 0.6f), k(start, 0.6f), k(arrive, 1.05f, outBack(1.2f)),
                    k(hoverEnd, 1.05f), k(end - 80f, 0.75f, inQuad), k(end, 0.08f, inQuad),
                ),
                opacity = track(k(0, 0), k(start, 0), k(start + 60f, 1), k(end - 30f, 1), k(end, 0)),
                rotate = track(
                    k(0, tiltDeg), k(start, tiltDeg), k(arrive, 0, outQuad), k(hoverEnd, 0), k(end, tiltDeg * 0.4f, inQuad),
                ),
            )
        }
    }

    /* --- wordmark ---------------------------------------------------- */

    private fun riseIn(g: Glyph, clipTop: Float, clipH: Float, start: Float, dipWeight: Float): GlyphTracks {
        val hide = (clipTop + clipH - g.y) * L.S + 2f
        return GlyphTracks(
            y = track(k(0, hide), k(start, hide), k(start + 560f, 0, outExpo)),
            opacity = track(k(0, 0), k(start, 0), k(start + 90f, 1)),
            dipWeight = dipWeight,
        )
    }

    val regent: List<GlyphTracks> = WordmarkGlyphs.REGENT.mapIndexed { i, g ->
        val weight = when (i) { 4 -> 1f; 3, 5 -> 0.3f; else -> 0f } // the "n" carries the agent
        riseIn(g, WordmarkGlyphs.REGENT_CLIP_TOP, WordmarkGlyphs.REGENT_CLIP_H, B.REGENT + i * 40f, weight)
    }

    val money: List<GlyphTracks> = WordmarkGlyphs.MONEY.mapIndexed { i, g ->
        riseIn(g, WordmarkGlyphs.MONEY_CLIP_TOP, WordmarkGlyphs.MONEY_CLIP_H, B.MONEY + i * 40f, 0f)
    }

    val leafScale = track(k(0, 0), k(B.LEAF, 0), k(B.LEAF + 260f, 1, outBack(2.2f)))
    val leafRotate = track(k(0, -50), k(B.LEAF, -50), k(B.LEAF + 260f, 0, outBack(1.6f)))
    val leafOpacity = track(k(0, 0), k(B.LEAF, 0), k(B.LEAF + 40f, 1))
    val notchScale = track(k(0, 0), k(B.NOTCH, 0), k(B.NOTCH + 240f, 1, outBack(2.2f)))
    val notchOpacity = track(k(0, 0), k(B.NOTCH, 0), k(B.NOTCH + 40f, 1))

    /* --- small touches ---------------------------------------------- */

    val sparkles: List<SparkleTracks> = listOf(
        floatArrayOf(L.left - 10f, L.top + 150f * L.S, 12f),
        floatArrayOf(L.left + 640f * L.S, L.top + 190f * L.S, 10f),
        floatArrayOf(L.perchX - 28f, L.perchY - CH * 0.8f + 2f, 11f),
    ).mapIndexed { i, arr ->
        val x = arr[0]
        val y = arr[1]
        val size = arr[2]
        val at = B.SPARKLES[i]
        SparkleTracks(
            x, y, size,
            scale = track(k(0, 0), k(at, 0), k(at + 200f, 1, outBack(2f)), k(at + 560f, 0, inQuad)),
            rotate = track(k(0, 0), k(at, 0), k(at + 560f, 120, outCubic)),
        )
    }

    val shadowOpacity = track(
        k(0, 0), k(B.DROP, 0), k(B.LAND, 1, inQuad), k(B.TAKEOFF, 1), k(B.TAKEOFF + 160f, 0, outQuad),
    )
    val shadowScale = track(
        k(0, 0.3f), k(B.DROP, 0.3f), k(B.LAND, 1, inQuad), k(B.LAND + 50f, 1.25f, outQuad),
        k(B.LAND + 420f, 1, spring(2f, 6f)), k(B.CROUCH, 1), k(B.TAKEOFF, 1.2f, outCubic), k(B.TAKEOFF + 160f, 0.5f, outQuad),
    )

    val puffs: List<PuffTracks> = listOf(
        floatArrayOf(B.LAND, 40f, 20f, L.groundX, L.groundY),
        floatArrayOf(B.PERCH, 18f, 10f, L.perchX, L.perchY),
    ).flatMap { arr ->
        val at = arr[0]
        val spread = arr[1]
        val size = arr[2]
        val x = arr[3]
        val y = arr[4]
        listOf(-1f, 1f).map { dir ->
            PuffTracks(
                size, x, y,
                dx = track(k(0, 0), k(at, 0), k(at + 380f, dir * spread, outCubic)),
                dy = track(k(0, 0), k(at, 0), k(at + 380f, -6, outCubic)),
                scale = track(k(0, 0.3f), k(at, 0.3f), k(at + 380f, 1.3f, outCubic)),
                opacity = track(k(0, 0), k(at, 0), k(at + 60f, 0.8f), k(at + 380f, 0)),
            )
        }
    }

    val haloOpacity = track(k(0, 0), k(B.REGENT - 80f, 0), k(B.REGENT + 700f, 1, outCubic))
    val haloScale = track(k(0, 0.7f), k(B.REGENT - 80f, 0.7f), k(B.REGENT + 700f, 1, outExpo))

    val ambientOpacity = track(k(0, 0), k(450f, 1, outCubic))
    val driftA = track(k(0, 0), k(B.DURATION, 18))
    val driftB = track(k(0, 0), k(B.DURATION, -18))

    val footerOpacity = track(k(0, 0), k(B.FOOTER, 0), k(B.FOOTER + 400f, 1, outCubic))
    val footerY = track(k(0, 12), k(B.FOOTER, 12), k(B.FOOTER + 400f, 0, outCubic))

    val exitOpacity = track(k(0, 1), k(B.EXIT, 1), k(B.DURATION, 0, inCubic))
    val exitY = track(k(0, 0), k(B.EXIT, 0), k(B.DURATION, -14, inCubic))
}
