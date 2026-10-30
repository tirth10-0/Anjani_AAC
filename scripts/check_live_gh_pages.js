async function checkLiveGhPages() {
  const urls = [
    'https://tirth10-0.github.io/ACC/',
    'https://tirth10-0.github.io/ACC/login.html',
    'https://tirth10-0.github.io/ACC/assets/js/tenant-context.js',
    'https://tirth10-0.github.io/ACC/assets/js/warehouses.js'
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u);
      const text = await res.text();
      console.log('=== ' + u + ' (status ' + res.status + ') ===');
      console.log('Contains Estimate:', text.includes('Estimate'));
      console.log('Contains Afield:', text.includes('Afield'));
      console.log('Contains Anjani:', text.includes('Anjani'));
      if (u.includes('tenant-context')) {
        console.log('tenant-context contains code E:', text.includes("code: 'E'") || text.includes('code: "E"'));
        console.log('tenant-context contains code ACC:', text.includes("code: 'ACC'") || text.includes('code: "ACC"'));
      }
    } catch (e) {
      console.log('Error fetching ' + u + ':', e.message);
    }
  }
}
checkLiveGhPages();
