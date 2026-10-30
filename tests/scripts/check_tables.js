const https = require('https');

const url = 'https://jtbettizhwwqmuyofapm.supabase.co/rest/v1/';
const options = {
  headers: {
    'apikey': 'sb_publishable_kSf8e6RD96lT40di2YqxxQ_gJ3WS6ve',
    'Authorization': 'Bearer sb_publishable__UaVFmqPrT2UVq_brpCeUQ_p4r63kcz'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
