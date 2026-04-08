const https = require('https');
const fs = require('fs');
const path = require('path');

const largeDictPath = path.join(__dirname, 'src', 'lib', 'largeDictionary.json');
const outputDictPath = path.join(__dirname, 'src', 'lib', 'rareDictionary.json');

const existingDict = JSON.parse(fs.readFileSync(largeDictPath, 'utf8'));
const existingWords = new Set(Object.keys(existingDict).map(w => w.toLowerCase()));

console.log('Fetching large dictionary...');

https.get('https://raw.githubusercontent.com/rajibdpi/dictionary/master/assets/E2Bdatabase.json', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      console.log('Parsing JSON...');
      const json = JSON.parse(data);
      const words = json.words;
      
      const rareDict = {};
      let count = 0;
      
      // Sort by length descending to get rarer words
      words.sort((a, b) => b.en.length - a.en.length);
      
      for (const item of words) {
        const en = item.en.toLowerCase();
        // Skip if already in existing dict, or if it has spaces, or if it's too short
        if (!existingWords.has(en) && !en.includes(' ') && en.length >= 8) {
          // Clean up Bengali meaning (take the first one if comma separated, remove (Adj.) etc.)
          let bn = item.bn.split(',')[0].replace(/\(.*?\)/g, '').trim();
          if (bn) {
            rareDict[en] = bn;
            count++;
          }
        }
        if (count >= 10000) break;
      }
      
      fs.writeFileSync(outputDictPath, JSON.stringify(rareDict, null, 2));
      console.log(`Saved ${count} rare words to ${outputDictPath}`);
    } catch(e) { 
      console.error(e); 
    }
  });
});
