import https from 'https';
import fs from 'fs';

const url = 'https://raw.githubusercontent.com/MinhasKamal/BengaliDictionary/master/BengaliDictionary.json';
const dest = './src/lib/largeDictionary.json';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      if (data.charCodeAt(0) === 0xFEFF) {
        data = data.slice(1);
      }
      const parsed = JSON.parse(data);
      const dict: Record<string, string> = {};
      let count = 0;
      for (const item of parsed) {
        if (count >= 10000) break;
        if (item.en && item.bn) {
          dict[item.en.toLowerCase()] = item.bn;
          count++;
        }
      }
      fs.writeFileSync(dest, JSON.stringify(dict, null, 2));
      console.log(`Saved ${count} words to ${dest}`);
    } catch (e) {
      console.error('Error parsing JSON:', e);
    }
  });
}).on('error', (err) => {
  console.error('Error downloading:', err.message);
});
