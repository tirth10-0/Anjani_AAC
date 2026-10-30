const fs = require('fs');

let content = fs.readFileSync('login.html', 'utf8');
if (!content.includes('navigator.serviceWorker.register')) {
  const swSnippet = '\r\n// Register Service Worker for PWA\r\nif (\'serviceWorker\' in navigator) {\r\n  window.addEventListener(\'load\', () => {\r\n    navigator.serviceWorker.register(\'./sw.js\').catch(err => {\r\n      console.warn(\'PWA ServiceWorker registration note:\', err);\r\n    });\r\n  });\r\n}\r\n';
  const lastScriptIdx = content.lastIndexOf('</script>');
  if (lastScriptIdx !== -1) {
    content = content.slice(0, lastScriptIdx) + swSnippet + content.slice(lastScriptIdx);
    fs.writeFileSync('login.html', content, 'utf8');
    console.log('Successfully added SW registration to login.html');
  }
}
