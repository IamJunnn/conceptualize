#!/usr/bin/env node

/**
 * Service Account Setup Test Script
 *
 * This script helps verify that your service account is configured correctly
 * before deploying to Firebase Functions.
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Service Account Setup...\n');

let hasErrors = false;

// Test 1: Check if service account key file exists
console.log('1️⃣  Checking for service account key file...');
const keyPaths = [
  './service-account-key.json',
  './functions/service-account-key.json',
  '../service-account-key.json',
];

let keyPath = null;
for (const p of keyPaths) {
  if (fs.existsSync(p)) {
    keyPath = p;
    break;
  }
}

if (keyPath) {
  console.log(`   ✅ Found service account key at: ${keyPath}`);
} else {
  console.log('   ❌ Service account key file not found');
  console.log('   💡 Expected locations:', keyPaths);
  hasErrors = true;
}

// Test 2: Validate service account key format
if (keyPath) {
  console.log('\n2️⃣  Validating service account key format...');
  try {
    const keyContent = fs.readFileSync(keyPath, 'utf8');
    const keyData = JSON.parse(keyContent);

    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !keyData[field]);

    if (missingFields.length === 0) {
      console.log('   ✅ Service account key format is valid');
      console.log(`   📧 Service account email: ${keyData.client_email}`);
      console.log(`   🏷️  Project ID: ${keyData.project_id}`);

      if (keyData.project_id !== 'conceptualize-c9a41') {
        console.log('   ⚠️  Warning: Project ID does not match expected "conceptualize-c9a41"');
      }
    } else {
      console.log('   ❌ Invalid service account key format');
      console.log('   Missing fields:', missingFields);
      hasErrors = true;
    }
  } catch (error) {
    console.log('   ❌ Failed to parse service account key file');
    console.log('   Error:', error.message);
    hasErrors = true;
  }
}

// Test 3: Check Firebase configuration
console.log('\n3️⃣  Checking Firebase configuration...');
const firebaseRcPath = './.firebaserc';
if (fs.existsSync(firebaseRcPath)) {
  console.log('   ✅ .firebaserc file exists');
  try {
    const firebaseRc = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf8'));
    if (firebaseRc.projects?.default === 'conceptualize-c9a41') {
      console.log('   ✅ Firebase project configured correctly');
    } else {
      console.log('   ⚠️  Firebase project mismatch');
      console.log(`   Current: ${firebaseRc.projects?.default}`);
      console.log('   Expected: conceptualize-c9a41');
    }
  } catch (error) {
    console.log('   ❌ Failed to parse .firebaserc');
    hasErrors = true;
  }
} else {
  console.log('   ❌ .firebaserc file not found');
  hasErrors = true;
}

// Test 4: Check functions directory
console.log('\n4️⃣  Checking functions directory...');
const functionsDir = './functions';
if (fs.existsSync(functionsDir)) {
  console.log('   ✅ functions/ directory exists');

  // Check package.json
  const functionsPackageJson = path.join(functionsDir, 'package.json');
  if (fs.existsSync(functionsPackageJson)) {
    console.log('   ✅ functions/package.json exists');

    try {
      const packageData = JSON.parse(fs.readFileSync(functionsPackageJson, 'utf8'));
      const requiredDeps = ['firebase-admin', 'firebase-functions', 'googleapis', 'cors'];
      const installedDeps = Object.keys(packageData.dependencies || {});
      const missingDeps = requiredDeps.filter(dep => !installedDeps.includes(dep));

      if (missingDeps.length === 0) {
        console.log('   ✅ All required dependencies are listed');
      } else {
        console.log('   ⚠️  Missing dependencies:', missingDeps);
        console.log('   💡 Run: cd functions && npm install');
      }

      // Check if node_modules exists
      if (fs.existsSync(path.join(functionsDir, 'node_modules'))) {
        console.log('   ✅ Dependencies installed (node_modules exists)');
      } else {
        console.log('   ⚠️  Dependencies not installed');
        console.log('   💡 Run: cd functions && npm install');
      }
    } catch (error) {
      console.log('   ❌ Failed to parse functions/package.json');
      hasErrors = true;
    }
  } else {
    console.log('   ❌ functions/package.json not found');
    hasErrors = true;
  }

  // Check index.js
  const functionsIndex = path.join(functionsDir, 'index.js');
  if (fs.existsSync(functionsIndex)) {
    console.log('   ✅ functions/index.js exists');
  } else {
    console.log('   ❌ functions/index.js not found');
    hasErrors = true;
  }
} else {
  console.log('   ❌ functions/ directory not found');
  hasErrors = true;
}

// Test 5: Check environment variables
console.log('\n5️⃣  Checking environment variables...');
const envPath = './.env';
if (fs.existsSync(envPath)) {
  console.log('   ✅ .env file exists');
  const envContent = fs.readFileSync(envPath, 'utf8');

  if (envContent.includes('VITE_FUNCTIONS_URL')) {
    console.log('   ✅ VITE_FUNCTIONS_URL is configured');
  } else {
    console.log('   ⚠️  VITE_FUNCTIONS_URL not found in .env');
    console.log('   💡 Add: VITE_FUNCTIONS_URL=https://us-central1-conceptualize-c9a41.cloudfunctions.net');
  }
} else {
  console.log('   ⚠️  .env file not found (optional for development)');
}

// Summary
console.log('\n' + '='.repeat(60));
if (hasErrors) {
  console.log('❌ Setup has errors. Please fix the issues above before deploying.');
  console.log('\n📚 See TEAM_SERVICE_ACCOUNT_QUICKSTART.md for detailed setup instructions.');
  process.exit(1);
} else {
  console.log('✅ All checks passed! You\'re ready to deploy.');
  console.log('\n📝 Next steps:');
  console.log('   1. Share team folders with service account email');
  console.log('   2. Deploy functions: firebase deploy --only functions');
  console.log('   3. Test with multiple users');
  console.log('\n📚 See TEAM_SERVICE_ACCOUNT_QUICKSTART.md for detailed instructions.');
  process.exit(0);
}
