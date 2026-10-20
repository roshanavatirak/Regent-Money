import os
import subprocess
from PIL import Image, ImageDraw

def run_resvg(svg_content, out_png_path, width=None, height=None):
    temp_svg = out_png_path + '.temp.svg'
    with open(temp_svg, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    
    cmd = ['npx', '-y', '@resvg/resvg-js-cli']
    if width:
        cmd.extend(['--fit-width', str(width)])
    if height:
        cmd.extend(['--fit-height', str(height)])
    cmd.extend([temp_svg, out_png_path])
    
    subprocess.run(cmd, check=True, capture_output=True, shell=True)
    if os.path.exists(temp_svg):
        os.remove(temp_svg)

# SVG templates based on assets/regent-money-icon.svg

SVG_FULL_MASTER = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="0.32" cy="0.18" r="1.05">
      <stop offset="0" stop-color="#14573F"/><stop offset="0.5" stop-color="#0B3A2B"/><stop offset="1" stop-color="#04190F"/>
    </radialGradient>
    <linearGradient id="green" gradientUnits="userSpaceOnUse" x1="589" y1="792" x2="870" y2="232">
      <stop offset="0" stop-color="#14A85A"/><stop offset="1" stop-color="#4BEA94"/>
    </linearGradient>
    <linearGradient id="ivory" gradientUnits="userSpaceOnUse" x1="232" y1="232" x2="560" y2="792">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9EFEA"/>
    </linearGradient>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#010C07" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g transform="translate(512 512) scale(0.86) translate(-550.8 -512)" filter="url(#lift)">
    <path fill="url(#green)" d="M588.6 792 L756.6 232 L869.6 232 L869.6 792 L756.6 792 L756.6 608.7 L701.6 792 Z"/>
    <polygon points="368.0,480.0 481.0,480.0 574.6,792.0 461.6,792.0" fill="url(#ivory)"/>
    <rect x="232" y="232" width="108" height="560" fill="url(#ivory)"/>
    <path d="M286 286 H440 A90 90 0 0 1 440 466 H286" fill="none" stroke="url(#ivory)" stroke-width="108"/>
  </g>
</svg>"""

SVG_LAUNCHER_FULL = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="0.32" cy="0.18" r="1.05">
      <stop offset="0" stop-color="#14573F"/><stop offset="0.5" stop-color="#0B3A2B"/><stop offset="1" stop-color="#04190F"/>
    </radialGradient>
    <linearGradient id="green" gradientUnits="userSpaceOnUse" x1="589" y1="792" x2="870" y2="232">
      <stop offset="0" stop-color="#14A85A"/><stop offset="1" stop-color="#4BEA94"/>
    </linearGradient>
    <linearGradient id="ivory" gradientUnits="userSpaceOnUse" x1="232" y1="232" x2="560" y2="792">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9EFEA"/>
    </linearGradient>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#010C07" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g transform="translate(512 512) scale(0.70) translate(-550.8 -512)" filter="url(#lift)">
    <path fill="url(#green)" d="M588.6 792 L756.6 232 L869.6 232 L869.6 792 L756.6 792 L756.6 608.7 L701.6 792 Z"/>
    <polygon points="368.0,480.0 481.0,480.0 574.6,792.0 461.6,792.0" fill="url(#ivory)"/>
    <rect x="232" y="232" width="108" height="560" fill="url(#ivory)"/>
    <path d="M286 286 H440 A90 90 0 0 1 440 466 H286" fill="none" stroke="url(#ivory)" stroke-width="108"/>
  </g>
</svg>"""

SVG_ADAPTIVE_BACKGROUND = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="0.32" cy="0.18" r="1.05">
      <stop offset="0" stop-color="#14573F"/><stop offset="0.5" stop-color="#0B3A2B"/><stop offset="1" stop-color="#04190F"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>"""

SVG_ADAPTIVE_FOREGROUND = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="green" gradientUnits="userSpaceOnUse" x1="589" y1="792" x2="870" y2="232">
      <stop offset="0" stop-color="#14A85A"/><stop offset="1" stop-color="#4BEA94"/>
    </linearGradient>
    <linearGradient id="ivory" gradientUnits="userSpaceOnUse" x1="232" y1="232" x2="560" y2="792">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9EFEA"/>
    </linearGradient>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#010C07" flood-opacity="0.45"/>
    </filter>
  </defs>
  <g transform="translate(512 512) scale(0.70) translate(-550.8 -512)" filter="url(#lift)">
    <path fill="url(#green)" d="M588.6 792 L756.6 232 L869.6 232 L869.6 792 L756.6 792 L756.6 608.7 L701.6 792 Z"/>
    <polygon points="368.0,480.0 481.0,480.0 574.6,792.0 461.6,792.0" fill="url(#ivory)"/>
    <rect x="232" y="232" width="108" height="560" fill="url(#ivory)"/>
    <path d="M286 286 H440 A90 90 0 0 1 440 466 H286" fill="none" stroke="url(#ivory)" stroke-width="108"/>
  </g>
</svg>"""

SVG_ADAPTIVE_MONOCHROME = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g transform="translate(512 512) scale(0.70) translate(-550.8 -512)">
    <path fill="#FFFFFF" d="M588.6 792 L756.6 232 L869.6 232 L869.6 792 L756.6 792 L756.6 608.7 L701.6 792 Z"/>
    <polygon points="368.0,480.0 481.0,480.0 574.6,792.0 461.6,792.0" fill="#FFFFFF"/>
    <rect x="232" y="232" width="108" height="560" fill="#FFFFFF"/>
    <path d="M286 286 H440 A90 90 0 0 1 440 466 H286" fill="none" stroke="#FFFFFF" stroke-width="108"/>
  </g>
</svg>"""

SVG_GLYPH_TRANSPARENT = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="green" gradientUnits="userSpaceOnUse" x1="589" y1="792" x2="870" y2="232">
      <stop offset="0" stop-color="#14A85A"/><stop offset="1" stop-color="#4BEA94"/>
    </linearGradient>
    <linearGradient id="ivory" gradientUnits="userSpaceOnUse" x1="232" y1="232" x2="560" y2="792">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9EFEA"/>
    </linearGradient>
  </defs>
  <g transform="translate(512 512) scale(0.86) translate(-550.8 -512)">
    <path fill="url(#green)" d="M588.6 792 L756.6 232 L869.6 232 L869.6 792 L756.6 792 L756.6 608.7 L701.6 792 Z"/>
    <polygon points="368.0,480.0 481.0,480.0 574.6,792.0 461.6,792.0" fill="url(#ivory)"/>
    <rect x="232" y="232" width="108" height="560" fill="url(#ivory)"/>
    <path d="M286 286 H440 A90 90 0 0 1 440 466 H286" fill="none" stroke="url(#ivory)" stroke-width="108"/>
  </g>
</svg>"""

def main():
    print("Generating Master PNGs...")
    temp_dir = "assets/temp_gen"
    os.makedirs(temp_dir, exist_ok=True)
    
    master_full = f"{temp_dir}/master_full.png"
    launcher_full_base = f"{temp_dir}/launcher_full.png"
    adaptive_bg = f"{temp_dir}/adaptive_bg.png"
    adaptive_fg = f"{temp_dir}/adaptive_fg.png"
    adaptive_mono = f"{temp_dir}/adaptive_mono.png"
    glyph_tp = f"{temp_dir}/glyph_tp.png"
    
    run_resvg(SVG_FULL_MASTER, master_full, 1024, 1024)
    run_resvg(SVG_LAUNCHER_FULL, launcher_full_base, 1024, 1024)
    run_resvg(SVG_ADAPTIVE_BACKGROUND, adaptive_bg, 1024, 1024)
    run_resvg(SVG_ADAPTIVE_FOREGROUND, adaptive_fg, 1024, 1024)
    run_resvg(SVG_ADAPTIVE_MONOCHROME, adaptive_mono, 1024, 1024)
    run_resvg(SVG_GLYPH_TRANSPARENT, glyph_tp, 1024, 1024)
    
    # 1. Update assets/ directory files
    print("Updating assets/ files...")
    im_master = Image.open(master_full)
    im_master.save("assets/appicon.png", format="PNG")
    im_master.save("assets/insideicon.png", format="PNG")
    im_master.save("assets/icon.png", format="PNG")
    im_master.resize((512, 512), Image.Resampling.LANCZOS).save("assets/splash-icon.png", format="PNG")
    im_master.resize((48, 48), Image.Resampling.LANCZOS).save("assets/favicon.png", format="PNG")
    
    im_fg = Image.open(adaptive_fg)
    im_fg.save("assets/adaptive-icon.png", format="PNG")
    
    # Update tree.png with the official glyph transparent
    im_glyph = Image.open(glyph_tp)
    im_glyph.resize((512, 512), Image.Resampling.LANCZOS).save("assets/tree.png", format="PNG")
    
    # Update notification-icon.png with monochrome glyph
    im_mono = Image.open(adaptive_mono)
    im_mono.resize((96, 96), Image.Resampling.LANCZOS).save("assets/notification-icon.png", format="PNG")
    
    # 2. Update Android mipmaps
    print("Updating Android mipmap-* densities...")
    densities = {
        'mdpi': {'legacy': 48, 'adaptive': 108},
        'hdpi': {'legacy': 72, 'adaptive': 162},
        'xhdpi': {'legacy': 96, 'adaptive': 216},
        'xxhdpi': {'legacy': 144, 'adaptive': 324},
        'xxxhdpi': {'legacy': 192, 'adaptive': 432},
    }
    
    im_launcher = Image.open(launcher_full_base)
    im_bg = Image.open(adaptive_bg)
    
    for density, sizes in densities.items():
        folder = f"android/app/src/main/res/mipmap-{density}"
        os.makedirs(folder, exist_ok=True)
        
        leg_sz = sizes['legacy']
        adap_sz = sizes['adaptive']
        
        # ic_launcher.webp
        im_leg = im_launcher.resize((leg_sz, leg_sz), Image.Resampling.LANCZOS)
        im_leg.save(f"{folder}/ic_launcher.webp", format="WEBP", quality=95)
        
        # ic_launcher_round.webp (create circle mask for legacy round)
        circle_mask = Image.new('L', (leg_sz, leg_sz), 0)
        draw = ImageDraw.Draw(circle_mask)
        draw.ellipse((0, 0, leg_sz, leg_sz), fill=255)
        im_round = im_leg.copy()
        im_round.putalpha(circle_mask)
        im_round.save(f"{folder}/ic_launcher_round.webp", format="WEBP", quality=95)
        
        # ic_launcher_background.webp (108dp canvas)
        im_bg_sz = im_bg.resize((adap_sz, adap_sz), Image.Resampling.LANCZOS)
        im_bg_sz.save(f"{folder}/ic_launcher_background.webp", format="WEBP", quality=95)
        
        # ic_launcher_foreground.webp (108dp canvas)
        im_fg_sz = im_fg.resize((adap_sz, adap_sz), Image.Resampling.LANCZOS)
        im_fg_sz.save(f"{folder}/ic_launcher_foreground.webp", format="WEBP", quality=95)
        
        # ic_launcher_monochrome.webp (108dp canvas)
        im_mono_sz = im_mono.resize((adap_sz, adap_sz), Image.Resampling.LANCZOS)
        im_mono_sz.save(f"{folder}/ic_launcher_monochrome.webp", format="WEBP", quality=95)
        
        print(f"  Generated {density}: legacy={leg_sz}x{leg_sz}, adaptive={adap_sz}x{adap_sz}")
        
    # 3. Update Android drawables (splashscreen_logo, ic_notification_large, ic_notification)
    print("Updating Android drawable-* densities...")
    draw_densities = {
        'drawable-mdpi': {'splash': 288, 'notif_lg': 64, 'notif_sm': 24},
        'drawable-hdpi': {'splash': 432, 'notif_lg': 96, 'notif_sm': 36},
        'drawable-xhdpi': {'splash': 576, 'notif_lg': 128, 'notif_sm': 48},
        'drawable-xxhdpi': {'splash': 864, 'notif_lg': 192, 'notif_sm': 72},
        'drawable-xxxhdpi': {'splash': 1152, 'notif_lg': 256, 'notif_sm': 96},
    }
    
    for folder_name, sz in draw_densities.items():
        folder = f"android/app/src/main/res/{folder_name}"
        if not os.path.exists(folder):
            continue
            
        # splashscreen_logo.png
        im_splash = im_master.resize((sz['splash'], sz['splash']), Image.Resampling.LANCZOS)
        im_splash.save(f"{folder}/splashscreen_logo.png", format="PNG")
        
        # ic_notification_large.png
        im_notif_lg = im_master.resize((sz['notif_lg'], sz['notif_lg']), Image.Resampling.LANCZOS)
        im_notif_lg.save(f"{folder}/ic_notification_large.png", format="PNG")
        
        # ic_notification.png (monochrome silhouette)
        im_notif_sm = im_mono.resize((sz['notif_sm'], sz['notif_sm']), Image.Resampling.LANCZOS)
        im_notif_sm.save(f"{folder}/ic_notification.png", format="PNG")
        
        print(f"  Generated {folder_name}: splash={sz['splash']}, notif_lg={sz['notif_lg']}, notif_sm={sz['notif_sm']}")
        
    print("Done generating all production assets!")

if __name__ == '__main__':
    main()
