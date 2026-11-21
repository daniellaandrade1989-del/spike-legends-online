import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');

test('firestore.rules enforces default deny safety net and rules_version 2', () => {
  assert.match(rules, /rules_version\s*=\s*'2';/);
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules covers all collections from firebase-blueprint.json', () => {
  const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));
  for (const path of Object.keys(blueprint.firestore)) {
    const collectionName = path.split('/')[1];
    assert.ok(rules.includes(`match /${collectionName}/`), `Missing match block for ${collectionName}`);
  }
});

test('firestore.rules enforces Dirty Dozen security invariants', () => {
  assert.match(rules, /isVerifiedUser\(\)/);
  assert.match(rules, /email_verified == true/);
  assert.match(rules, /hasOnly\(/);
  assert.match(rules, /hasAll\(/);
  assert.match(rules, /request\.time/);
  assert.match(rules, /allow list:\s*if false;/); // userAccounts
  assert.match(rules, /allow update, delete:\s*if false;/); // matchHistory
  assert.match(rules, /isValidId\(/);
});
