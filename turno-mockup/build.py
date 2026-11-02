"""Unisce src/ in un unico file: index.html (pagina completa, apribile da browser)."""
import pathlib
d = pathlib.Path(__file__).parent
src = d / 'src'
css, eng, i18n, app = [(src / f).read_text() for f in ('style.css', 'engine.js', 'i18n.js', 'app.js')]
head = '''<title>Turno · Fasi</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap">
<style>
''' + css + '</style>\n'
body = '''<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js"></script>
<script>
''' + eng + '\n</script>\n<script>\n' + i18n + '\n</script>\n<script>\n' + app + '\n</script>\n'
(d / 'index.html').write_text('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' + head + '</head>\n<body>\n' + body + '</body>\n</html>\n')
print('index.html scritto')
