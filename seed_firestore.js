// seed_firestore.js
// Usage: node seed_firestore.js --serviceAccount=./serviceAccount.json
// Installs: npm i firebase-admin minimist

const admin = require('firebase-admin');
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const saPath = argv.serviceAccount || './serviceAccount.json';
if(!fs.existsSync(saPath)){
  console.error('Service account not found at', saPath); process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();
(async ()=>{
  try{
    const raw = fs.readFileSync('math_questions_100.json','utf8');
    const j = JSON.parse(raw);
    for(const set of j.sets){
      const id = set.id || set.title.replace(/\s+/g,'_').toLowerCase();
      console.log('Writing set', id);
      await db.collection('testSets').doc(id).set({ title: set.title, questions: set.questions });
    }
    console.log('Done seeding testSets');
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1); }
})();