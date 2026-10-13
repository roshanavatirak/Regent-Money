/**
 * Regent Money: 5 second launch intro
 * from RAO Dev Studios
 *
 * Needs:  react-native-svg   (npx expo install react-native-svg)
 *
 * Usage:
 *   const [introDone, setIntroDone] = useState(false);
 *   if (!introDone) return <RegentIntro onFinish={() => setIntroDone(true)} />;
 *
 * How it stays smooth: the whole intro runs on ONE native-driver clock that
 * counts 0 → 5000 ms. Every movement below is a keyframe track on that clock,
 * so nothing waits on the JS thread, even while your app loads behind it.
 *
 * Story (ms)
 *   0–1000     the money agent drops in and lands with a squash and a puff
 *   680–1560   three bank-SMS transactions fly in; it catches each one
 *   1640–2400  it crouches and backflips onto the "n" while the logo rises
 *   2400–2900  the landing dips the letters, the green leaf and notch click in
 *   2980–3960  it waves hello and "from RAO Dev Studios" fades up
 *   4550–5000  everything lifts away, then onFinish() is called
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { syncService } from '../services/syncService';

/* ------------------------------------------------------------------ */
/* Brand                                                              */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#fafbfc',
  white: '#ffffff',
  green: '#2dba4e',
  greenDeep: '#1f8f3a',
  mist: '#e7f7eb',
  ink: '#1c252e',
  muted: '#7b8794',
};

const DURATION = 5000;

/* Key moments on the 5 s clock, in ms */
const B = {
  drop: 120,
  land: 540,
  chips: [1080, 1260, 1440], // each transaction reaches the agent
  crouch: 1640,
  takeoff: 1820,
  perch: 2400, // lands on the "n" of Regent
  regent: 1740, // first letter of "Regent" starts rising
  money: 1940,
  leaf: 2460,
  notch: 2560,
  sparkles: [2620, 2740, 2860],
  wave: 2980,
  footer: 3000,
  exit: 4550,
};

const CHIPS = [
  { label: 'Coffee', amount: '−₹180', credit: false },
  { label: 'Salary', amount: '+₹52,000', credit: true },
  { label: 'Rent', amount: '−₹15,000', credit: false },
];

/* ------------------------------------------------------------------ */
/* Logo, traced to vectors from the Regent Money wordmark             */
/* Units: wordmark space, 632 × 338                                   */
/* ------------------------------------------------------------------ */

type GlyphData = { x: number; y: number; w: number; h: number; d: string };
const g = (x: number, y: number, w: number, h: number, d: string): GlyphData => ({ x, y, w, h, d });

/* "Regent" in reading order: R e g e n t */
const REGENT: GlyphData[] = [
  g(0.8, 0.5, 121.8, 133.5, 'M1.2 1C0.8 1.5 0.8 1.8 0.8 67.2C0.8 126.2 0.8 133 1.2 133.4C1.5 134 1.5 134 13.9 134C24.8 134 26.2 134 26.6 133.6C26.9 133.2 27 131.3 27 116.2C27.1 70.9 27.2 26.5 27.4 26.3C27.7 25.8 68.7 25.9 71.3 26.4C83.1 28.6 90.1 36.9 90.1 48.6C90.1 58.3 85 66.2 76.9 69.2C72.5 70.9 69.8 71.2 60.5 71.2C54.2 71.2 53.6 71.3 52.9 71.7C52.1 72.3 43.1 81.2 42.4 82.2C42.2 82.6 42 83.3 42 83.9C42 84.8 42.2 85.1 50.3 93.2C58.2 101.2 66 109.4 75.2 119.2C80.5 124.9 85.7 130.4 87.6 132.4L89.1 134L105.5 134C122.4 134 122.5 134 122.5 133C122.5 132.9 121.2 131.4 119.7 129.8C118.1 128.2 115.3 125.2 113.4 123.1C111.4 121.1 108.6 118.1 107.1 116.5C105.6 114.9 103.3 112.5 102 111.1C100.7 109.8 98.1 107 96.3 105.1C87.9 96.4 83.1 91.4 83.1 91.2C82.9 90.8 83.5 90.2 84.1 90.2C85 90.2 90.5 88.3 93 87.1C99.1 84.1 105.7 78.6 108.9 73.7C109.5 72.7 110.3 71.5 110.6 71C113.1 67.2 115.6 59.9 116.4 53.5C119 33.7 109.1 14.6 91.9 6.3C85.5 3.2 78.8 1.4 71.8 0.8C69.9 0.6 56.5 0.5 35.3 0.5C2.1 0.5 1.8 0.5 1.2 1Z'),
  g(124.2, 35.3, 104.5, 99.8, 'M176.6 35.4C162.9 36.4 153.6 39.7 145 46.6C130.5 58.3 124.2 78 128.6 97.7C130.1 104.2 134.4 112.6 138.7 117.7C146.4 126.6 156.1 131.9 169.2 134.3C173.5 135.1 185.9 135.1 190.5 134.4C203.2 132.4 212.4 127.9 220.4 119.6C222.2 117.9 222.8 117.1 222.7 116.7C222.6 116.3 220.9 114.8 216.4 111.5C213 108.9 209.4 106.1 208.3 105.3C206 103.4 205.5 103.4 204.2 104.6C201.5 107.5 196.3 110.8 192.1 112.3C186.7 114.3 178.7 114.8 173.2 113.4C166.3 111.7 161.5 108.7 157.6 103.5C155.2 100.4 153.1 95.6 153.6 94.4C153.7 94.1 157.6 94 190.4 94C221.7 94 227.2 93.9 227.6 93.6C228.7 92.9 228.6 81.5 227.5 75C223.7 53.1 207.8 38.4 185.1 35.9C181.2 35.4 178.3 35.3 176.6 35.4ZM183.3 56.8C193.2 58.5 200 64.1 202.5 72.6C203 74.1 203 74.6 202.8 74.9C202.3 75.4 154.2 75.4 153.8 74.9C153.1 74.1 155.1 69.6 157.6 66.1C163 58.8 173.4 55 183.3 56.8Z'),
  g(237.1, 34.6, 102.4, 140.1, 'M278.5 36.5C255.6 39.9 239.3 58.4 238 82.2C237.1 99.6 243.4 114.1 256.2 124.2C264.3 130.5 275.4 133.9 286.4 133.4C297.1 132.9 304.6 130 311.9 123.5C313.4 122.2 314.6 121.3 314.8 121.4C315.2 121.6 314.9 128.8 314.4 131.4C312.6 140.8 306.4 147.4 297.1 150.2C291.4 151.9 281.8 151.8 275.5 150C274 149.6 272.5 149.1 272 149C269.4 148.2 265.1 145.6 261.4 142.5C260 141.4 258.8 140.5 258.5 140.5C257.8 140.5 243.2 155.3 243.2 156C243.2 157.2 248.5 161.4 253.9 164.5C269.9 173.5 296.2 174.7 312.8 167C326.8 160.6 335.3 149.4 338.2 133.9C339.5 127 339.5 127.8 339.5 82.1C339.5 39.8 339.5 39.5 339 39C338.2 38.2 316.6 38.2 315.7 39C315.2 39.4 315.1 39.6 315 43.4C315 45.6 314.9 47.5 314.8 47.6C314.6 47.7 314 47.3 313.2 46.5C304.7 38.5 291.2 34.6 278.5 36.5ZM292.1 58C301.3 58.9 309.5 64.8 313.5 73.3C315.9 78.5 316.6 86.4 315.2 92.2C312.3 103.7 302.4 111.8 290.8 112.2C280.9 112.5 273 108.9 267.5 101.6C260.8 92.7 260.5 78.9 266.9 69.5C271.3 62.9 278.4 58.8 286.5 58C289.5 57.8 289.6 57.8 292.1 58Z'),
  g(350.9, 34.6, 102.8, 100.6, 'M397.5 35.1C388.8 35.8 378.8 39.2 372 44C358.2 53.6 351 67.7 350.9 85.2C350.9 97.1 354.2 107.3 360.7 115.8C369 126.5 380.6 132.7 395.9 134.8C399.5 135.2 411 135 415.2 134.3C420.6 133.4 426.4 131.7 430.4 129.8C436.2 126.9 440.2 124.1 444.6 119.7C447 117.3 447.2 116.6 446.1 115.8C445.7 115.5 443.5 113.8 441.1 112.1C438.8 110.4 435.4 107.8 433.6 106.3C431.8 104.9 430.2 103.8 429.9 103.8C429.7 103.8 428.6 104.5 427.7 105.4C423.4 109.4 418 112.1 412.2 113.4C408.1 114.4 400.6 114.4 397 113.5C387.5 111.2 380.3 104.9 377.6 96.6C377.3 95.4 377.2 94.7 377.3 94.4C377.5 94 380.7 94 414.4 94C453.6 94 451.9 94.1 452 92.9C452.4 90.1 452.4 81.4 452 78.5C449.8 58.7 438 43.6 419.9 37.7C414 35.7 404.4 34.6 397.5 35.1ZM407.9 56.8C417.2 58.5 423.9 64.1 426.4 71.9C427.5 75.5 430.6 75.1 402.2 75.2C380 75.2 377.5 75.2 377.3 74.9C377.2 74.4 378 71.7 379.1 69.5C383.9 59.9 396.2 54.5 407.9 56.8Z'),
  g(464.6, 34.4, 93.6, 99.7, 'M513.8 35.8C504.8 36.9 497.5 40.4 491.1 46.3C490.4 46.9 489.6 47.5 489.5 47.5C489.2 47.5 489.2 47.7 489.2 42.9C489.1 39.6 489.1 39.2 488.6 38.9C488.2 38.6 486.2 38.5 477 38.5C466.4 38.5 465.8 38.5 465.2 39C464.6 39.4 464.6 39.4 464.6 86.1C464.7 130.9 464.7 132.8 465.1 133.2C465.6 133.8 465.8 133.8 476.8 133.8C483 133.8 488.2 133.6 488.4 133.6C489.2 133 489.2 132.5 489.2 105.1C489.2 78.6 489.2 77.9 489.8 75.6C491.7 66.7 497.2 60.9 505.9 58.6C509.1 57.8 515.8 57.6 518.5 58.4C526 60.4 530.1 64.2 532.4 71.1C533.6 74.7 533.6 75.3 533.6 104.1C533.7 119.1 533.7 131.7 533.7 132C533.8 132.4 534 133 534.2 133.2C535 134 557.2 134 557.8 133.3C558.2 132.9 558.2 130.3 558.2 101.6C558.2 69.8 558.2 68.1 557.2 63.2C555.4 53.9 550.4 46.2 543 41.4C535.5 36.5 524.3 34.4 513.8 35.8Z'),
  g(566.2, 38.2, 64.3, 96.9, 'M567.7 39C567.1 39.4 567.1 39.4 567 49C567 61 566.2 59.8 573.7 59.8C577.6 59.8 579.2 59.8 579.4 60.1C579.7 60.3 579.8 65.6 579.8 82.2C579.8 108.6 579.8 110 582 116.1C584.7 123.9 591.2 130.3 599.1 132.9C603.9 134.4 606.2 134.8 612.6 134.9C618.2 135 619.1 135 623.4 134.4C629.3 133.6 629.2 133.6 629.8 133C630.5 132.2 630.5 113.6 629.8 112.9C629.3 112.5 629 112.5 625.2 112.8C620.5 113.1 615 113 612.9 112.4C608.2 111.1 605.7 108 605 102.6C604.6 99.9 604.6 60.9 605 60.2C605.2 59.8 605.6 59.8 617.2 59.8C628.9 59.8 629.3 59.7 629.8 59.2C630.5 58.5 630.5 39.8 629.8 39C629 38.2 568.7 38.2 567.7 39Z'),
];

/* "Money" in reading order: M o n e y */
const MONEY: GlyphData[] = [
  g(1.2, 168.5, 151.5, 129.5, 'M3.1 168.7C2.6 168.8 1.9 169 1.7 169.2C1.3 169.5 1.2 172.9 1.2 233L1.2 296.5L2 297.3C2.7 298 2.7 298 14 298C24.9 298 26.5 297.9 27.1 297.2C27.1 297.2 27.2 277.5 27.2 253.6C27.4 211.8 27.4 210.1 27.8 210C28.2 210 29.4 211.1 32 213.8C34.1 215.9 39.2 221 43.3 225.2C47.5 229.5 54.2 236.4 58.4 240.6C62.5 244.8 67.8 250.2 70.1 252.6L74.3 256.9L76.3 257C79.9 257.1 79.8 257.2 89.9 246.6C91.9 244.5 94.6 241.7 95.8 240.5C96.9 239.3 101 235.1 104.8 231.2C110.8 225 114.5 221.2 123.4 212C125.6 209.8 126.5 209.4 126.5 210.5C126.5 210.7 126.5 230.2 126.5 253.8C126.5 296.8 126.5 296.8 127.1 297.4C127.7 298 127.7 298 139.6 298C151.2 298 151.5 298 152.1 297.5C152.8 297 152.8 297 152.8 233.3C152.8 169.6 152.8 169.6 152.2 169.1C151.7 168.6 151.1 168.6 143.9 168.5C139.6 168.5 134.7 168.5 133 168.6L129.9 168.8L128.2 170.5C126 172.8 122.3 176.9 121 178.4C119.7 179.9 115.3 184.6 111.6 188.5C110.2 189.9 108.4 191.8 107.7 192.7C107 193.5 104.1 196.7 101.4 199.7C98.6 202.7 95.6 206.1 94.5 207.2C93.5 208.4 92.4 209.6 92 210C91.2 210.6 87.2 215.1 82.6 220.2C78.2 225.2 78.4 225 77.2 225C75.8 225 74.9 224.4 72.9 222C71.9 220.8 70.3 219 69.2 217.9C68.2 216.8 66.8 215.2 66.1 214.5C65.4 213.7 64 212.1 62.9 211C61.9 209.8 59.1 206.8 56.9 204.2C54.6 201.7 52.2 199 51.6 198.4C50.9 197.7 49.7 196.4 48.9 195.5C48.1 194.6 46 192.4 44.3 190.5C40.8 186.6 39.5 185.2 35.5 181C33.9 179.3 31.2 176.3 29.4 174.4C27.7 172.5 25.8 170.4 25.2 169.8L24 168.6L14.1 168.6C8.6 168.6 3.7 168.6 3.1 168.7Z'),
  g(167.0, 196.8, 109.6, 102.6, 'M216 197C214.4 197.1 212.3 197.4 211.2 197.6C210.2 197.9 208.7 198.1 207.8 198.2C205 198.7 196.4 202 193.6 203.7C181.6 211 175 218.6 170.2 230.6C169.6 232.4 169 234 169 234.2C169 234.5 168.8 235.4 168.5 236.3C168.2 237.2 167.9 238.8 167.7 239.9C167.6 241 167.4 242.5 167.2 243.2C167 245 167 250.1 167.2 252.5C167.6 255.9 168.3 259.9 168.5 260.2C168.6 260.3 168.8 261 168.9 261.6C169.1 263.3 171.5 269.5 172.8 272C177.8 281.2 185 288.4 193.8 293C196 294.2 202.6 297 203.2 297C203.4 297 204.3 297.2 205.3 297.5C211.6 299.1 213.2 299.3 221.2 299.3C230.8 299.3 236.7 298.4 242.1 296.1C242.6 296 243.2 295.7 243.5 295.6C243.8 295.5 245.6 294.7 247.4 293.8C259.3 288.2 268.8 277.8 273.2 265.8C275.5 259.7 276.2 256 276.4 248.8C276.6 243.6 276.2 240.1 275 236.2C274.8 235.3 274.5 234.2 274.4 233.8C274.1 232.2 272 227.2 270.6 224.6C262.7 209.7 248.2 199.9 230.1 197.3C227.6 196.9 219.4 196.8 216 197ZM227.8 219.9C235.7 221.8 240.6 225 245.7 231.6C250.5 238 251.9 249.3 248.9 258.2C246.3 266 239.3 273 232 275.2C225.8 277.2 223.1 277.4 217 276.5C212.8 275.9 210.8 275.2 207.7 273.4C200.4 269.1 196.2 263.8 194.3 256.5C192.3 248.9 192.8 242.8 195.8 235.5C197.8 230.9 202 226.3 207.1 223.3C210.6 221.2 214.2 220.1 219.4 219.4C222 219.1 225.4 219.3 227.8 219.9Z'),
  g(289.8, 195.3, 99.7, 102.5, 'M346.6 195.6C346.2 195.7 344.6 195.9 343.1 196.1C334.7 197.2 326 201.2 319.6 207C317.2 209.2 317.2 209.2 317 204.2C316.9 201.2 316.8 200 316.5 199.6C316.2 199.3 315 199.2 304.1 199.2C289.8 199.2 291 199 291 202.3C290.9 226.1 291 296.6 291.2 296.8C291.5 297.7 292.4 297.8 304.2 297.8C315.7 297.8 316 297.7 316.5 297.2C317 296.8 317 296.4 317 269C317 245.2 317 241.1 317.4 239.2C319.7 226.2 329.3 218.5 342.9 219.1C351.7 219.4 358.7 224 361 230.8C361.3 231.6 361.6 232.6 361.8 232.8C361.9 233 362.2 234.6 362.5 236.3C363 239.2 363 240.5 363.1 268C363.2 296.5 363.2 296.5 363.7 297.1C364.3 297.6 364.3 297.6 376 297.7C389.2 297.8 388.8 297.8 389.2 296.1C389.5 295.4 389.5 285.9 389.4 263.4C389.3 225.5 389.4 227 386.9 219.2C384.7 212.2 380 206.1 373.8 202C372.2 200.9 370.6 199.9 370.3 199.8C369.2 199.2 364.3 197.5 363 197.2C362.2 197.1 361.4 196.8 361.2 196.7C360 196.1 348.9 195.3 346.6 195.6Z'),
  g(403.0, 195.6, 104.4, 103.5, 'M452.1 195.9C441 196.6 430.2 200.6 422.1 207.1C416.5 211.6 410.8 219 408.3 224.8C406.6 228.9 405.5 231.6 405.3 232.9C403.4 241.5 403 245.5 403.5 251.2C404.6 265.6 410.4 277.4 420.8 286.3C424 289 429.4 292.5 433.1 294C437.8 295.9 441.2 297 442.4 297C442.7 297 443.2 297.2 443.6 297.4C444 297.5 445.7 297.8 447.4 298C449 298.2 451 298.4 451.9 298.5C455.8 299.1 467.8 298.4 471.4 297.4C472.1 297.2 473.3 296.9 474.1 296.8C476.4 296.3 483.2 293.7 486.1 292.2C491.1 289.5 496.6 285.2 500.1 281.3C501.9 279.2 502 279.4 497.3 275.8C488.8 269.4 485.9 267.2 485.5 266.6C484.8 265.8 483.8 266.2 481.4 268.3C474.6 274.4 468.4 276.7 458.8 276.9C450.4 277.1 446 275.8 439.3 270.9C435.6 268.3 432.7 264.2 430.9 259C430 256.4 430.1 256 432.1 256C471 256 506 255.8 506.4 255.5C507.2 255.1 507.3 254.5 507.4 248.1C507.4 234.8 504.4 225 497.6 215.2C492.9 208.6 484.7 202.5 476.1 199.1C474.5 198.5 472.5 198 467.9 196.9C463.7 196 457.8 195.6 452.1 195.9ZM462.8 217.5C470 219.4 474.8 222.7 478.4 228.3C480.2 231.2 481.6 235 481 236.1C480.8 236.8 480.8 236.8 456 236.8C434.3 236.8 431.3 236.7 431 236.4C430 235.1 432.9 228.9 436.2 225.4C439.8 221.6 443.7 219.4 450 217.6C453 216.8 459.7 216.7 462.8 217.5Z'),
  g(510.0, 194.6, 114.8, 142.1, 'M610.1 194.8C597.3 194.9 597.3 194.9 596.6 195.5C596.3 195.8 595.9 196.3 595.8 196.6C595.8 196.9 595 198.7 594.2 200.5C593.4 202.5 592.5 204.7 592.2 205.5C591.6 207.2 587 218.1 585.2 222.1C584.1 224.8 583.2 226.8 581.5 231C580.8 232.7 579.6 235.6 578.8 237.5C578 239.4 576.9 241.9 576.4 243.1C574.2 248.5 572 253.9 570.6 257.1C568.8 261.8 568.7 261.9 568 261.9C567.4 261.9 567.2 261.5 565.9 258.1C565 256 564.2 254 564 253.6C563.6 252.9 562.6 250.7 561 246.6C560.6 245.6 559.7 243.6 559 242C557.7 239.1 557 237.4 554.9 232.4C553.9 229.9 552.8 227.4 552.2 226.1C552.1 225.8 551.7 224.8 551.3 223.8C550.9 222.7 550 220.6 549.2 219C548.6 217.4 547.6 215.1 547.1 213.9C546.6 212.6 546 211.4 545.8 211C545.7 210.6 545.2 209.5 544.8 208.5C543.6 205.7 542.8 203.8 542.2 202.6C542 202.1 541.7 201.4 541.6 201C541.2 199.5 539.4 195.9 539 195.6C538.4 195 511.6 195.1 510.8 195.6C510 196.2 510.1 196.6 512.4 201.4C513.6 203.9 516 209 517.8 212.9C519.6 216.7 521.5 220.8 522 221.9C524.3 226.7 530.5 240 532 243.4C533 245.4 534.1 247.8 534.6 248.8C535 249.6 536.6 253.1 538.1 256.4C539.7 259.7 542 264.6 543.3 267.4C546.5 274.1 550.9 283.6 551.6 285.1C551.9 285.8 552.6 287.5 553.3 288.8C554 290.2 554.5 291.6 554.5 292C554.5 292.5 553.7 294.4 552.7 296.5C551.8 298.5 550.8 300.5 550.6 301.1C549.6 304 546.3 308.9 544.5 310.3C543 311.4 540.3 312.5 538 313C535.6 313.5 533.5 313.4 529.4 312.6C525.8 312 525.9 312 524.7 315C524.3 315.9 523.5 317.8 522.9 319.4C522.2 320.9 521.4 323.1 521 324.2C520.5 325.4 520 326.8 519.7 327.4C519 328.7 518.3 331 518.2 331.8C518.2 332.7 518.6 332.9 521.2 333.7C526.2 335.3 526.8 335.5 533 336C540.9 336.7 549.7 334.5 556 330.4C564.2 325 569.1 317.8 577.8 298.8C578.5 297.2 579.3 295.3 579.6 294.6C579.9 293.9 580.7 292.3 581.2 291C581.8 289.7 583 287.2 583.8 285.5C585.3 282.1 586.3 280 587.8 276.6C588.4 275.4 589.8 272.2 591 269.6C592.2 267 594.3 262.5 595.6 259.6C596.9 256.7 598.4 253.4 599 252.2C599.5 251.1 600.8 248.3 601.8 246.1C602.8 243.9 604.1 241 604.8 239.6C605.4 238.2 606.6 235.8 607.2 234.2C608 232.7 608.9 230.7 609.2 229.9C609.6 229 610.6 227.1 611.2 225.5C612.5 222.8 613.7 220.1 615.2 216.9C615.6 216 616.6 213.8 617.5 211.9C621.4 203 623.6 198.4 623.8 198.1C624.4 197.4 624.7 195.8 624.4 195.3C623.9 194.6 624.2 194.6 610.1 194.8Z'),
];

/* the two green accents of the logo */
const NOTCH = g(40.9, 99.0, 33.8, 35.2, 'M41.3 99.6C40.9 100 40.9 131.9 41.3 132.8C41.4 133.2 41.8 133.6 42.2 133.8C43.1 134.1 73.4 134.1 73.9 133.7C74.7 133.1 73.9 132.1 67.2 125.1C63.5 121.1 58.9 116.4 57.2 114.5C55.4 112.6 51.9 109 49.5 106.5C47.1 104 44.5 101.3 43.8 100.6C42.6 99.2 41.9 99 41.3 99.6Z');  // inside the R
const LEAF = g(579.6, 11.9, 25.6, 20.1, 'M591.9 12.3C591 12.4 590.3 12.6 590.1 12.8C590 12.9 589.3 13.2 588.6 13.4C584.6 15 581.3 19.2 580.2 24.4C579.6 27.2 579.6 30.8 580.2 31.4C580.7 31.9 603.6 31.9 604.4 31.4C605.2 30.8 605.2 13.2 604.4 12.5C603.7 12 594.8 11.9 591.9 12.3Z');   // on top of the t

const SPARKLE =
  'M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z';

/* ------------------------------------------------------------------ */
/* Layout                                                             */
/* ------------------------------------------------------------------ */

const WM_W = 632;
const WM_H = 338;
const PERCH = { x: 508, y: 37.5 }; // top of the "n" in Regent
const REGENT_CLIP = { top: 0, h: 177 };
const MONEY_CLIP = { top: 160, h: 179 };
const CW = 60; // character box
const CH = 72;
const JUMP_H = 110;
const BIG = 1.7; // the agent is bigger on its own, then shrinks onto the logo
const SHADOW_W = 76;
const CHIP_W = 168;
const CHIP_H = 38;

function layout(W: number, H: number) {
  const logoW = Math.min(W * 0.74, 300);
  const S = logoW / WM_W;
  const logoH = WM_H * S;
  const left = (W - logoW) / 2;
  const top = H * 0.42 - logoH / 2;
  return {
    W,
    H,
    S,
    logoW,
    logoH,
    left,
    top,
    groundX: W / 2,
    groundY: top + logoH * 0.74,
    perchX: left + PERCH.x * S,
    perchY: top + PERCH.y * S,
    footerBottom: Math.max(36, H * 0.055),
  };
}
type Layout = ReturnType<typeof layout>;

/* ------------------------------------------------------------------ */
/* Keyframe engine                                                    */
/* ------------------------------------------------------------------ */

type Ease = (p: number) => number;
type Key = [ms: number, value: number, ease?: Ease, steps?: number];

const linear: Ease = p => p;
const inQuad: Ease = p => p * p;
const outQuad: Ease = p => 1 - (1 - p) * (1 - p);
const inCubic: Ease = p => p * p * p;
const outCubic: Ease = p => 1 - Math.pow(1 - p, 3);
const inOutCubic: Ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const inOutSine: Ease = p => -(Math.cos(Math.PI * p) - 1) / 2;
const outExpo: Ease = p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const outBack =
  (s = 1.7): Ease =>
  p =>
    1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
/** Damped spring that still lands exactly on the target at p = 1 */
const spring =
  (bounces = 2, decay = 6): Ease =>
  p =>
    (1 - Math.exp(-decay * p) * Math.cos(2 * Math.PI * bounces * p)) /
    (1 - Math.exp(-decay) * Math.cos(2 * Math.PI * bounces));

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Samples eased keyframes into an interpolation table the native driver can run. */
function track(keys: Key[]) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  keys.forEach(([ms, value, ease, steps = 14], i) => {
    if (i === 0 || !ease) {
      inputRange.push(ms);
      outputRange.push(value);
      return;
    }
    const [pms, pv] = keys[i - 1];
    for (let s = 1; s <= steps; s++) {
      const p = s / steps;
      inputRange.push(round(pms + (ms - pms) * p));
      outputRange.push(round(pv + (value - pv) * ease(p)));
    }
  });
  return { inputRange, outputRange };
}

/* ------------------------------------------------------------------ */
/* Timeline                                                           */
/* ------------------------------------------------------------------ */

function buildTimeline(t: Animated.Value, L: Layout) {
  const v = (keys: Key[]) => t.interpolate({ ...track(keys), extrapolate: 'clamp' });
  const deg = (keys: Key[]) => {
    const { inputRange, outputRange } = track(keys);
    return t.interpolate({
      inputRange,
      outputRange: outputRange.map(n => `${n}deg`),
      extrapolate: 'clamp',
    });
  };

  /* --- the agent --------------------------------------------------- */
  const gx = L.groundX - CW / 2;
  const gy = L.groundY - CH;
  const px = L.perchX - CW / 2;
  const py = L.perchY - CH;
  const apex = (B.takeoff + B.perch) / 2;
  const size = v([[0, BIG], [B.takeoff, BIG], [B.perch, 1, inOutCubic, 20]]);

  // the "n" sinks a little under the agent's weight, then springs back
  const dip = v([[0, 0], [B.perch, 0], [B.perch + 60, 5, outQuad], [B.perch + 480, 0, spring(1.5, 5), 24]]);

  const munch = (at: number): Key[] => [
    [at - 40, 0],
    [at + 5, 0.5, outQuad],
    [at + 120, 0, spring(1, 6), 16],
  ];
  // > 0 squashes, < 0 stretches
  const squash = v([
    [0, 0],
    [B.drop, 0],
    [B.land - 20, -0.4, inQuad],
    [B.land + 50, 1, outQuad],
    [B.land + 420, 0, spring(2, 6), 24],
    ...munch(B.chips[0]),
    ...munch(B.chips[1]),
    ...munch(B.chips[2]),
    [B.crouch, 0],
    [B.takeoff, 0.8, outCubic],
    [B.takeoff + 80, -0.5, outQuad],
    [B.takeoff + 330, 0, inOutSine],
    [B.perch, 0],
    [B.perch + 50, 0.9, outQuad],
    [B.perch + 450, 0, spring(2, 6), 24],
    [3300, -0.05, inOutSine],
    [3800, 0.04, inOutSine],
    [4300, -0.04, inOutSine],
    [4800, 0, inOutSine],
  ]);

  const mouth = v([
    [0, 0], [150, 0], [200, 1], [540, 1], [600, 0],
    [1030, 0], [1070, 1], [1150, 0],
    [1210, 0], [1250, 1], [1330, 0],
    [1390, 0], [1430, 1], [1510, 0],
    [1880, 0], [1940, 1], [2380, 1], [2460, 0],
    [3150, 0], [3200, 1], [3500, 1], [3560, 0],
  ]);

  const agent = {
    size,
    x: v([[0, gx], [B.takeoff, gx], [B.perch, px, linear]]),
    y: Animated.add(
      Animated.add(
        v([[0, -CH - 40], [B.drop, -CH - 40], [B.land, gy, inQuad], [B.takeoff, gy], [B.perch, py, linear]]),
        v([[0, 0], [B.takeoff, 0], [apex, -JUMP_H, outQuad], [B.perch, 0, inQuad]]),
      ),
      dip,
    ),
    flip: deg([[0, 0], [B.takeoff + 40, 0], [B.perch - 40, 360, inOutCubic, 24]]),
    tilt: deg([
      [0, 0], [880, 0], [980, -7, outQuad], [1100, -7], [1200, 6, inOutSine], [1290, 6], [1380, 0, inOutSine],
      [2600, 0], [2700, -6, outQuad], [2900, -6], [3000, 0, inOutSine],
      [3160, 4, outQuad], [3760, 4], [3960, 0, inOutSine],
    ]),
    scaleX: squash.interpolate({ inputRange: [-1, 1], outputRange: [0.8, 1.2] }),
    scaleY: squash.interpolate({ inputRange: [-1, 1], outputRange: [1.24, 0.76] }),
    armL: deg([
      [0, 150], [B.land, 150], [B.land + 260, 25, spring(1.5, 5), 20],
      [B.chips[0] - 120, 25], [B.chips[0] - 20, 95, outQuad], [B.chips[0] + 120, 25, outCubic],
      [B.crouch, 25], [B.takeoff, 10, outQuad], [B.takeoff + 80, 160, outQuad],
      [B.perch - 100, 160], [B.perch + 80, 85, outQuad], [B.perch + 500, 25, spring(1.5, 5), 20],
    ]),
    armR: deg([
      [0, -150], [B.land, -150], [B.land + 260, -25, spring(1.5, 5), 20],
      [B.chips[1] - 120, -25], [B.chips[1] - 20, -95, outQuad], [B.chips[1] + 120, -25, outCubic],
      [B.crouch, -25], [B.takeoff, -10, outQuad], [B.takeoff + 80, -160, outQuad],
      [B.perch - 100, -160], [B.perch + 80, -85, outQuad], [B.perch + 500, -25, spring(1.5, 5), 20],
      // hello wave
      [B.wave, -25], [B.wave + 180, -150, outBack(1.6)],
      [B.wave + 300, -118, inOutSine], [B.wave + 420, -160, inOutSine],
      [B.wave + 540, -118, inOutSine], [B.wave + 660, -160, inOutSine],
      [B.wave + 780, -135, inOutSine], [B.wave + 980, -25, inOutCubic],
    ]),
    sprout: deg([
      [0, 0], [B.drop, 0], [B.land - 20, -14, inQuad], [B.land + 60, 22, outQuad], [B.land + 460, 0, spring(2, 5), 24],
      [B.takeoff, 0], [B.takeoff + 80, -20, outQuad], [B.takeoff + 330, 0, inOutSine],
      [B.perch, 0], [B.perch + 60, 24, outQuad], [B.perch + 500, 0, spring(2, 5), 24],
      [3160, 0], [3460, 8, inOutSine], [3760, -6, inOutSine], [3960, 0, inOutSine],
    ]),
    lookX: v([
      [0, 0], [700, 0], [780, -2.6, outQuad], [1080, -2.6], [1160, 2.6, inOutSine], [1260, 2.6],
      [1330, 1, inOutSine], [1440, 1], [1540, 0, inOutSine],
      [2600, 0], [2700, -2.6, outQuad], [2900, -2.6], [3000, 0, inOutSine],
    ]),
    lookY: v([
      [0, 0], [120, 0], [300, 2, outQuad], [540, 2], [640, 0, outQuad],
      [1260, 0], [1330, -2.4, inOutSine], [1440, -2.4], [1540, 0, inOutSine],
      [2600, 0], [2700, 2, outQuad], [2900, 2], [3000, 0, inOutSine],
    ]),
    blink: v([
      [0, 1], [B.land - 10, 1], [B.land + 30, 0.15, outQuad], [B.land + 160, 1, outQuad],
      [B.crouch + 20, 1], [B.crouch + 140, 0.45, outQuad], [B.crouch + 240, 1, outQuad],
      [2840, 1], [2890, 0.1, inQuad], [2990, 1, outQuad],
      [4080, 1], [4130, 0.1, inQuad], [4230, 1, outQuad],
    ]),
    mouth,
    smile: mouth.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  };

  /* --- transactions flying in ------------------------------------- */
  const mouthX = L.groundX;
  const mouthY = L.groundY - 22 * BIG;
  const chipFrom: [number, number, number][] = [
    [-CHIP_W / 2 - 10, L.groundY - 130, -10],
    [L.W + CHIP_W / 2 + 10, L.groundY - 175, 10],
    [L.W * 0.72, -CHIP_H, -6],
  ];
  const chips = chipFrom.map(([fx, fy, tilt], i) => {
    const end = B.chips[i];
    const start = end - 400;
    return {
      x: v([[0, fx - CHIP_W / 2], [start, fx - CHIP_W / 2], [end, mouthX - CHIP_W / 2, outCubic]]),
      y: v([[0, fy - CHIP_H / 2], [start, fy - CHIP_H / 2], [end, mouthY - CHIP_H / 2, inOutSine]]),
      scale: v([[0, 0.6], [start, 0.6], [start + 120, 1, outBack(1.4)], [end - 120, 0.9], [end, 0.08, inQuad]]),
      opacity: v([[0, 0], [start, 0], [start + 80, 1], [end - 40, 1], [end, 0]]),
      rotate: deg([[0, tilt], [start, tilt], [end - 80, 0, outQuad]]),
    };
  });

  /* --- wordmark ---------------------------------------------------- */
  const riseIn = (glyph: GlyphData, clip: { top: number; h: number }, start: number) => {
    const hide = (clip.top + clip.h - glyph.y) * L.S + 2;
    return {
      y: v([[0, hide], [start, hide], [start + 560, 0, outExpo, 18]]),
      opacity: v([[0, 0], [start, 0], [start + 90, 1]]),
    };
  };
  const regent = REGENT.map((glyph, i) => {
    const r = riseIn(glyph, REGENT_CLIP, B.regent + i * 40);
    const weight = i === 4 ? 1 : i === 3 || i === 5 ? 0.3 : 0; // the "n" carries the agent
    return weight ? { ...r, y: Animated.add(r.y, Animated.multiply(dip, weight)) } : r;
  });
  const money = MONEY.map((glyph, i) => riseIn(glyph, MONEY_CLIP, B.money + i * 40));

  const accents = {
    leaf: {
      scale: v([[0, 0], [B.leaf, 0], [B.leaf + 260, 1, outBack(2.2)]]),
      rotate: deg([[0, -50], [B.leaf, -50], [B.leaf + 260, 0, outBack(1.6)]]),
      opacity: v([[0, 0], [B.leaf, 0], [B.leaf + 40, 1]]),
      y: Animated.multiply(dip, 0.3),
    },
    notch: {
      scale: v([[0, 0], [B.notch, 0], [B.notch + 240, 1, outBack(2.2)]]),
      opacity: v([[0, 0], [B.notch, 0], [B.notch + 40, 1]]),
    },
  };

  /* --- small touches ---------------------------------------------- */
  const sparkles = [
    { x: L.left - 12, y: L.top + 150 * L.S, size: 14 },
    { x: L.left + 640 * L.S, y: L.top + 190 * L.S, size: 11 },
    { x: L.perchX - 36, y: L.perchY - CH + 2, size: 12 },
  ].map((spot, i) => {
    const at = B.sparkles[i];
    return {
      ...spot,
      scale: v([[0, 0], [at, 0], [at + 200, 1, outBack(2)], [at + 560, 0, inQuad]]),
      rotate: deg([[0, 0], [at, 0], [at + 560, 120, outCubic]]),
    };
  });

  const shadow = {
    opacity: v([[0, 0], [B.drop, 0], [B.land, 1, inQuad], [B.takeoff, 1], [B.takeoff + 160, 0, outQuad]]),
    scale: v([
      [0, 0.3], [B.drop, 0.3], [B.land, 1, inQuad], [B.land + 50, 1.25, outQuad],
      [B.land + 420, 1, spring(2, 6), 20], [B.crouch, 1], [B.takeoff, 1.2, outCubic], [B.takeoff + 160, 0.5, outQuad],
    ]),
  };

  const puffs = [
    { at: B.land, spread: 40, size: 20, x: L.groundX, y: L.groundY },
    { at: B.perch, spread: 18, size: 10, x: L.perchX, y: L.perchY },
  ].flatMap(({ at, spread, size, x, y }) =>
    [-1, 1].map(dir => ({
      size,
      x,
      y,
      dx: v([[0, 0], [at, 0], [at + 380, dir * spread, outCubic]]),
      dy: v([[0, 0], [at, 0], [at + 380, -6, outCubic]]),
      scale: v([[0, 0.3], [at, 0.3], [at + 380, 1.3, outCubic]]),
      opacity: v([[0, 0], [at, 0], [at + 60, 0.8], [at + 380, 0]]),
    })),
  );

  return {
    agent,
    chips,
    regent,
    money,
    accents,
    sparkles,
    shadow,
    puffs,
    halo: {
      opacity: v([[0, 0], [1700, 0], [2700, 1, outCubic]]),
      scale: v([[0, 0.7], [1700, 0.7], [2700, 1, outExpo]]),
    },
    ambient: {
      opacity: v([[0, 0], [700, 1, outCubic]]),
      driftA: v([[0, 0], [DURATION, 22]]),
      driftB: v([[0, 0], [DURATION, -20]]),
    },
    footer: {
      opacity: v([[0, 0], [B.footer, 0], [B.footer + 500, 1, outCubic]]),
      y: v([[0, 12], [B.footer, 12], [B.footer + 500, 0, outCubic]]),
    },
    exit: {
      opacity: v([[0, 1], [B.exit, 1], [DURATION, 0, inCubic]]),
      y: v([[0, 0], [B.exit, 0], [DURATION, -14, inCubic]]),
    },
  };
}
type Timeline = ReturnType<typeof buildTimeline>;

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */

function Glyph({ g: glyph, S, color }: { g: GlyphData; S: number; color: string }) {
  return (
    <Svg width={glyph.w * S} height={glyph.h * S} viewBox={`${glyph.x} ${glyph.y} ${glyph.w} ${glyph.h}`}>
      <Path d={glyph.d} fill={color} />
    </Svg>
  );
}

function Glow({ id, size, strength }: { id: string; size: number; strength: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={C.green} stopOpacity={strength} />
          <Stop offset="0.55" stopColor={C.green} stopOpacity={strength * 0.35} />
          <Stop offset="1" stopColor={C.green} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

/* Pivot points: move to the pivot, rotate/scale, move back (works on every RN version) */
const FEET = { translateY: CH / 2 };
const FEET_BACK = { translateY: -CH / 2 };
const SHOULDER = { translateY: -9 }; // arms are 18 tall, pivot at the top
const SHOULDER_BACK = { translateY: 9 };
const STEM = { translateY: 8 }; // sprout box is 16 tall, pivot at the bottom
const STEM_BACK = { translateY: -8 };

/** The money agent: a little green coin with a sprout */
function Agent({ a }: { a: Timeline['agent'] }) {
  return (
    <Animated.View style={[styles.agent, { transform: [{ translateX: a.x }, { translateY: a.y }] }]}>
      {/* size, tilt and squash pivot on the feet; the flip spins around the middle */}
      <Animated.View style={[styles.layer, { transform: [FEET, { scale: a.size }, FEET_BACK] }]}>
        <Animated.View style={[styles.layer, { transform: [{ rotate: a.flip }] }]}>
          <Animated.View style={[styles.layer, { transform: [FEET, { rotate: a.tilt }, FEET_BACK] }]}>
            <Animated.View
              style={[styles.layer, { transform: [FEET, { scaleX: a.scaleX }, { scaleY: a.scaleY }, FEET_BACK] }]}
            >
              <Animated.View
                style={[styles.arm, { left: 6, transform: [SHOULDER, { rotate: a.armL }, SHOULDER_BACK] }]}
              />
              <Animated.View
                style={[styles.arm, { left: 48, transform: [SHOULDER, { rotate: a.armR }, SHOULDER_BACK] }]}
              />
              <View style={[styles.foot, { left: 16 }]} />
              <View style={[styles.foot, { left: 31 }]} />

              <Animated.View style={[styles.sprout, { transform: [STEM, { rotate: a.sprout }, STEM_BACK] }]}>
                <View style={styles.stem} />
                <View style={styles.sproutLeaf} />
              </Animated.View>

              <View style={styles.body}>
                <View style={styles.rim} />
                <View style={styles.gloss} />
                {[11, 26].map(left => (
                  <Animated.View key={left} style={[styles.eye, { left, transform: [{ scaleY: a.blink }] }]}>
                    <Animated.View
                      style={[styles.pupil, { transform: [{ translateX: a.lookX }, { translateY: a.lookY }] }]}
                    >
                      <View style={styles.glint} />
                    </Animated.View>
                  </Animated.View>
                ))}
                <View style={[styles.cheek, { left: 6 }]} />
                <View style={[styles.cheek, { left: 35 }]} />
                <Animated.View style={[styles.smile, { opacity: a.smile }]} />
                <Animated.View style={[styles.mouthOpen, { opacity: a.mouth }]} />
              </View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Intro                                                              */
/* ------------------------------------------------------------------ */

export type RegentIntroProps = { onFinish?: () => void };

export default function RegentIntro({ onFinish }: RegentIntroProps) {
  const { width: W, height: H } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const L = useMemo(() => layout(W, H), [W, H]);
  const A = useMemo(() => buildTimeline(t, L), [t, L]);
  const finish = useRef(onFinish);
  finish.current = onFinish;

  useEffect(() => {
    // Preload & sync financial records in the background during the 5s intro
    try {
      syncService.sync().catch((err) => {
        console.warn('[RegentIntro] Background sync error during intro preload:', err);
      });
    } catch (e) {
      // Continue without blocking intro
    }

    let cancelled = false;
    let anim: Animated.CompositeAnimation | null = null;
    t.setValue(0);

    const checkReduceMotion = typeof AccessibilityInfo?.isReduceMotionEnabled === 'function'
      ? AccessibilityInfo.isReduceMotionEnabled().catch(() => false)
      : Promise.resolve(false);

    checkReduceMotion.then((reduceMotion) => {
      if (cancelled) return;
      const clock = (to: number, duration: number) =>
        Animated.timing(t, {
          toValue: to,
          duration,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== 'web',
        });

      if (reduceMotion) {
        // Calm version: show the finished frame, keep the same 5 s length.
        t.setValue(4000);
        anim = Animated.sequence([Animated.delay(4000), clock(DURATION, 1000)]);
      } else {
        anim = clock(DURATION, DURATION);
      }
      anim.start(({ finished }) => {
        if (finished) finish.current?.();
      });
    });

    return () => {
      cancelled = true;
      anim?.stop();
    };
  }, [t]);

  const haloSize = L.logoW * 1.8;
  const blobSize = W * 1.5;

  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Regent Money, from RAO Dev Studios"
    >
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: A.exit.opacity, transform: [{ translateY: A.exit.y }] }]}
      >
        {/* soft ambient light */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: A.ambient.opacity }]}>
          <Animated.View
            style={{
              position: 'absolute',
              left: -blobSize * 0.55,
              top: -blobSize * 0.5,
              transform: [{ translateX: A.ambient.driftA }, { translateY: A.ambient.driftA }],
            }}
          >
            <Glow id="glowA" size={blobSize} strength={0.1} />
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute',
              left: W - blobSize * 0.45,
              top: H - blobSize * 0.45,
              transform: [{ translateX: A.ambient.driftB }, { translateY: A.ambient.driftB }],
            }}
          >
            <Glow id="glowB" size={blobSize} strength={0.08} />
          </Animated.View>
        </Animated.View>

        {/* halo behind the logo */}
        <Animated.View
          style={{
            position: 'absolute',
            left: W / 2 - haloSize / 2,
            top: L.top + L.logoH / 2 - haloSize / 2,
            opacity: A.halo.opacity,
            transform: [{ scale: A.halo.scale }],
          }}
        >
          <Glow id="halo" size={haloSize} strength={0.16} />
        </Animated.View>

        {/* ground shadow and landing puffs */}
        <Animated.View
          style={[
            styles.shadow,
            {
              left: L.groundX - SHADOW_W / 2,
              top: L.groundY - 6,
              opacity: A.shadow.opacity,
              transform: [{ scaleX: A.shadow.scale }],
            },
          ]}
        />
        {A.puffs.map((p, i) => (
          <Animated.View
            key={`puff-${i}`}
            style={[
              styles.puff,
              {
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                left: p.x - p.size / 2,
                top: p.y - p.size,
                opacity: p.opacity,
                transform: [{ translateX: p.dx }, { translateY: p.dy }, { scale: p.scale }],
              },
            ]}
          />
        ))}

        {/* the logo, letter by letter */}
        <View style={{ position: 'absolute', left: L.left, top: L.top, width: L.logoW, height: L.logoH }}>
          <View style={[styles.clip, { top: REGENT_CLIP.top * L.S, height: REGENT_CLIP.h * L.S }]}>
            {REGENT.map((glyph, i) => (
              <Animated.View
                key={`r-${i}`}
                style={{
                  position: 'absolute',
                  left: glyph.x * L.S,
                  top: (glyph.y - REGENT_CLIP.top) * L.S,
                  opacity: A.regent[i].opacity,
                  transform: [{ translateY: A.regent[i].y }],
                }}
              >
                <Glyph g={glyph} S={L.S} color={C.ink} />
              </Animated.View>
            ))}
          </View>
          <View style={[styles.clip, { top: MONEY_CLIP.top * L.S, height: MONEY_CLIP.h * L.S }]}>
            {MONEY.map((glyph, i) => (
              <Animated.View
                key={`m-${i}`}
                style={{
                  position: 'absolute',
                  left: glyph.x * L.S,
                  top: (glyph.y - MONEY_CLIP.top) * L.S,
                  opacity: A.money[i].opacity,
                  transform: [{ translateY: A.money[i].y }],
                }}
              >
                <Glyph g={glyph} S={L.S} color={C.green} />
              </Animated.View>
            ))}
          </View>
          <Animated.View
            style={[
              styles.accent,
              {
                left: NOTCH.x * L.S,
                top: NOTCH.y * L.S,
                opacity: A.accents.notch.opacity,
                transform: [
                  { translateX: (-NOTCH.w * L.S) / 2 },
                  { translateY: (NOTCH.h * L.S) / 2 },
                  { scale: A.accents.notch.scale },
                  { translateX: (NOTCH.w * L.S) / 2 },
                  { translateY: (-NOTCH.h * L.S) / 2 },
                ],
              },
            ]}
          >
            <Glyph g={NOTCH} S={L.S} color={C.green} />
          </Animated.View>
          <Animated.View
            style={[
              styles.accent,
              {
                left: LEAF.x * L.S,
                top: LEAF.y * L.S,
                opacity: A.accents.leaf.opacity,
                transform: [
                  { translateY: A.accents.leaf.y },
                  { translateX: (-LEAF.w * L.S) / 2 },
                  { translateY: (LEAF.h * L.S) / 2 },
                  { rotate: A.accents.leaf.rotate },
                  { scale: A.accents.leaf.scale },
                  { translateX: (LEAF.w * L.S) / 2 },
                  { translateY: (-LEAF.h * L.S) / 2 },
                ],
              },
            ]}
          >
            <Glyph g={LEAF} S={L.S} color={C.green} />
          </Animated.View>
        </View>

        {/* bank SMS transactions */}
        {A.chips.map((c, i) => (
          <Animated.View
            key={`chip-${i}`}
            style={[
              styles.chip,
              {
                opacity: c.opacity,
                transform: [{ translateX: c.x }, { translateY: c.y }, { rotate: c.rotate }, { scale: c.scale }],
              },
            ]}
          >
            <View style={styles.chipIcon}>
              <Text style={styles.chipIconText}>₹</Text>
            </View>
            <Text style={styles.chipLabel}>{CHIPS[i].label}</Text>
            <Text style={[styles.chipAmount, CHIPS[i].credit && { color: C.green }]}>{CHIPS[i].amount}</Text>
          </Animated.View>
        ))}

        {/* sparkles */}
        {A.sparkles.map((s, i) => (
          <Animated.View
            key={`spark-${i}`}
            style={{
              position: 'absolute',
              left: s.x - s.size / 2,
              top: s.y - s.size / 2,
              transform: [{ rotate: s.rotate }, { scale: s.scale }],
            }}
          >
            <Svg width={s.size} height={s.size} viewBox="0 0 24 24">
              <Path d={SPARKLE} fill={C.green} />
            </Svg>
          </Animated.View>
        ))}

        <Agent a={A.agent} />

        <Animated.View
          style={[
            styles.footer,
            { bottom: L.footerBottom, opacity: A.footer.opacity, transform: [{ translateY: A.footer.y }] },
          ]}
        >
          <Text style={styles.from}>from</Text>
          <Text style={styles.studio}>RAO Dev Studios</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    flex: 1,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  clip: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  accent: { position: 'absolute' },
  shadow: {
    position: 'absolute',
    width: SHADOW_W,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(28,37,46,0.12)',
  },
  puff: { position: 'absolute', backgroundColor: 'rgba(28,37,46,0.06)' },

  /* transaction chip */
  chip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CHIP_W,
    height: CHIP_H,
    borderRadius: CHIP_H / 2,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 7,
    paddingRight: 14,
    shadowColor: C.ink,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  chipIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIconText: { fontSize: 13, fontWeight: '800', color: C.green },
  chipLabel: { flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '600', color: C.ink },
  chipAmount: { fontSize: 13, fontWeight: '700', color: C.ink },

  /* the agent (all sizes in a 60 × 72 box, feet at the bottom) */
  agent: { position: 'absolute', left: 0, top: 0, width: CW, height: CH },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  arm: {
    position: 'absolute',
    top: 42,
    width: 6,
    height: 18,
    borderRadius: 3,
    backgroundColor: C.greenDeep,
  },
  foot: { position: 'absolute', top: 66, width: 13, height: 6, borderRadius: 3, backgroundColor: C.greenDeep },
  sprout: { position: 'absolute', left: 18, top: 6, width: 24, height: 16 },
  stem: {
    position: 'absolute',
    left: 10.5,
    top: 6,
    width: 3,
    height: 10,
    borderRadius: 1.5,
    backgroundColor: C.greenDeep,
  },
  sproutLeaf: {
    position: 'absolute',
    left: 12,
    top: 1,
    width: 12,
    height: 7,
    backgroundColor: C.greenDeep,
    borderTopLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 1,
    transform: [{ rotate: '-25deg' }],
  },
  body: {
    position: 'absolute',
    left: 6,
    top: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.green,
    overflow: 'hidden',
  },
  rim: {
    position: 'absolute',
    left: 5,
    top: 5,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  gloss: {
    position: 'absolute',
    left: 9,
    top: 6,
    width: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
    transform: [{ rotate: '-30deg' }],
  },
  eye: {
    position: 'absolute',
    top: 15,
    width: 11,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: { width: 5.5, height: 6.5, borderRadius: 3, backgroundColor: C.ink },
  glint: {
    position: 'absolute',
    left: 1,
    top: 1,
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.white,
  },
  cheek: {
    position: 'absolute',
    top: 29,
    width: 7,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  smile: {
    position: 'absolute',
    left: 18.5,
    top: 28,
    width: 11,
    height: 6,
    borderColor: C.ink,
    borderWidth: 2.4,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  mouthOpen: {
    position: 'absolute',
    left: 20,
    top: 27.5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.ink,
  },

  /* footer */
  footer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  from: { fontSize: 12, color: C.muted, letterSpacing: 0.3 },
  studio: { marginTop: 2, fontSize: 15, fontWeight: '700', color: C.ink, letterSpacing: 0.2 },
});
