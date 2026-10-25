# 3D Robotics Portfolio Template

A single-page portfolio with a 3D scroll-driven backdrop. Plain HTML, CSS and JavaScript, no build step. Three.js loads from a CDN.

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. Opening `index.html` directly from disk also works.

## Reuse the template

1. **Your content**: edit `index.html`. All copy is in the HTML: name, role, abstract, results, experience, selected work, open source, skills and contact. The sections are marked with `data-cam` attributes, one camera pose per section.
2. **Your details**: update the `<title>`, meta tags and JSON-LD in `<head>`, plus `llms.txt`, `sitemap.xml` and `robots.txt` (URLs and summary).
3. **Your files**: replace `assets/pdf/` (resume), `assets/img/og.png` (1200x630 social image) and `assets/img/work/` (poster images and GIFs for the work cards).
4. **Your colours and fonts**: change the variables at the top of `assets/css/style.css`.
5. **The 3D scene**: `assets/js/world3d.js` holds the camera poses and the robot route. The backdrop point cloud is `assets/data/warehouse_hero.bin` (a `uint32` point count followed by `int16` x, y, z at 2 cm). After replacing it, regenerate `assets/data/warehouse_hero.b64.js` (the same bytes as base64, assigned to `window.__HERO_BIN`; it is what lets the page work from disk) and update the route and stations in `world3d.js` so they stay clear of walls.
