const fs = require('node:fs');
const path = require('node:path');
const { ROOT, load, args, cli } = require('./lib.cjs');

const FIELDS = [
  'id',
  'name',
  'user_supplied_name',
  'geography',
  'description',
  'source_url',
  'source_type',
  'research_status',
  'checked_on',
];
function buildCsv(clubs) {
  const quote = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [FIELDS.join(',')];
  for (const club of clubs) {
    const unknown = Object.keys(club).filter((key) => !FIELDS.includes(key));
    if (unknown.length)
      throw new Error(`Unknown club fields: ${unknown.join(', ')}`);
    rows.push(FIELDS.map((field) => quote(club[field])).join(','));
  }
  return Buffer.from(`${rows.join('\r\n')}\r\n`);
}
function main(argv, root = ROOT) {
  const options = args({ check: { type: 'boolean' } }, argv);
  if (options.help) {
    console.log(
      'Generate data/clubs.csv. Usage: node scripts/build_clubs_csv.cjs [--check]',
    );
    return 0;
  }
  const result = buildCsv(load('clubs', root));
  const file = path.join(root, 'data/clubs.csv');
  if (options.check) {
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(result)) {
      console.error('data/clubs.csv is out of date; run npm run generate');
      return 1;
    }
    console.log('Clubs CSV is up to date.');
  } else {
    fs.writeFileSync(file, result);
    console.log('Wrote data/clubs.csv.');
  }
  return 0;
}
module.exports = { FIELDS, buildCsv, main };
if (require.main === module) cli(main);
