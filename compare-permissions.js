/**
 * Permission Comparison Script
 * 
 * Compare permissions between source and target Directus instances
 * 
 * Usage:
 * node compare-permissions.js <source-url> <source-token> <target-url> <target-token>
 * 
 * Example:
 * node compare-permissions.js http://source:8055 source-token http://target:8055 target-token
 */

const https = require('https');
const http = require('http');
const url = require('url');

// Command line arguments
const [,, sourceUrl, sourceToken, targetUrl, targetToken] = process.argv;

if (!sourceUrl || !sourceToken || !targetUrl || !targetToken) {
  console.error('❌ Usage: node compare-permissions.js <source-url> <source-token> <target-url> <target-token>');
  process.exit(1);
}

// HTTP request helper
function makeRequest(requestUrl, token) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(requestUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Fetch permissions from an instance
async function fetchPermissions(instanceUrl, token, label) {
  try {
    console.log(`📡 Fetching permissions from ${label}...`);
    const permissionsUrl = `${instanceUrl}/permissions?limit=-1`;
    const response = await makeRequest(permissionsUrl, token);
    
    const permissions = response.data || response || [];
    
    if (!Array.isArray(permissions)) {
      throw new Error(`Invalid permissions response format from ${label}`);
    }
    
    console.log(`✅ ${label}: ${permissions.length} permissions loaded`);
    return permissions;
  } catch (error) {
    console.error(`❌ Failed to fetch from ${label}:`, error.message);
    throw error;
  }
}

// Create permission signature for comparison
function createPermissionSignature(permission) {
  return `${permission.collection}.${permission.action}`;
}

// Compare permissions
function comparePermissions(sourcePermissions, targetPermissions) {
  const sourceMap = new Map();
  const targetMap = new Map();
  
  // Build maps
  sourcePermissions.forEach(p => {
    const sig = createPermissionSignature(p);
    if (!sourceMap.has(sig)) {
      sourceMap.set(sig, []);
    }
    sourceMap.get(sig).push(p);
  });
  
  targetPermissions.forEach(p => {
    const sig = createPermissionSignature(p);
    if (!targetMap.has(sig)) {
      targetMap.set(sig, []);
    }
    targetMap.get(sig).push(p);
  });
  
  // Find differences
  const onlyInSource = [];
  const onlyInTarget = [];
  const inBoth = [];
  const different = [];
  
  // Check source permissions
  sourceMap.forEach((sourcePerms, sig) => {
    if (targetMap.has(sig)) {
      const targetPerms = targetMap.get(sig);
      inBoth.push({
        signature: sig,
        source: sourcePerms,
        target: targetPerms
      });
      
      // Check for differences in details
      if (sourcePerms.length !== targetPerms.length) {
        different.push({
          signature: sig,
          issue: 'Different count',
          sourceCount: sourcePerms.length,
          targetCount: targetPerms.length
        });
      }
    } else {
      onlyInSource.push({
        signature: sig,
        permissions: sourcePerms
      });
    }
  });
  
  // Check target permissions
  targetMap.forEach((targetPerms, sig) => {
    if (!sourceMap.has(sig)) {
      onlyInTarget.push({
        signature: sig,
        permissions: targetPerms
      });
    }
  });
  
  return {
    onlyInSource,
    onlyInTarget,
    inBoth,
    different
  };
}

// Main comparison function
async function compareInstances() {
  try {
    console.log('🔍 Comparing permissions between instances...');
    console.log(`📍 Source: ${sourceUrl}`);
    console.log(`📍 Target: ${targetUrl}`);
    console.log('');

    // Fetch permissions from both instances
    const [sourcePermissions, targetPermissions] = await Promise.all([
      fetchPermissions(sourceUrl, sourceToken, 'Source'),
      fetchPermissions(targetUrl, targetToken, 'Target')
    ]);
    
    console.log('');
    
    // Compare permissions
    const comparison = comparePermissions(sourcePermissions, targetPermissions);
    
    // Display results
    console.log('📊 Comparison Results:');
    console.log(''.padEnd(80, '='));
    
    console.log(`\n✅ Permissions in both instances: ${comparison.inBoth.length}`);
    console.log(`❌ Only in source: ${comparison.onlyInSource.length}`);
    console.log(`➕ Only in target: ${comparison.onlyInTarget.length}`);
    console.log(`⚠️  Different details: ${comparison.different.length}`);
    
    // Show missing from target (likely migration failures)
    if (comparison.onlyInSource.length > 0) {
      console.log('\n❌ Permissions missing from target (migration may have failed):');
      console.log(''.padEnd(60, '-'));
      comparison.onlyInSource.forEach(item => {
        console.log(`  🔑 ${item.signature} (${item.permissions.length} permission(s))`);
        item.permissions.forEach(p => {
          console.log(`    - ID: ${p.id}, Policy: ${p.policy || 'None'}`);
        });
      });
    }
    
    // Show extra in target
    if (comparison.onlyInTarget.length > 0) {
      console.log('\n➕ Permissions only in target:');
      console.log(''.padEnd(60, '-'));
      comparison.onlyInTarget.forEach(item => {
        console.log(`  🔑 ${item.signature} (${item.permissions.length} permission(s))`);
        item.permissions.forEach(p => {
          console.log(`    - ID: ${p.id}, Policy: ${p.policy || 'None'}`);
        });
      });
    }
    
    // Show differences
    if (comparison.different.length > 0) {
      console.log('\n⚠️  Permissions with different details:');
      console.log(''.padEnd(60, '-'));
      comparison.different.forEach(item => {
        console.log(`  🔑 ${item.signature}: ${item.issue}`);
        console.log(`    Source: ${item.sourceCount}, Target: ${item.targetCount}`);
      });
    }
    
    // Migration success rate
    const totalSourceSignatures = comparison.onlyInSource.length + comparison.inBoth.length;
    const migratedSignatures = comparison.inBoth.length;
    const successRate = totalSourceSignatures > 0 ? 
      ((migratedSignatures / totalSourceSignatures) * 100).toFixed(1) : 0;
    
    console.log('\n📈 Migration Analysis:');
    console.log(''.padEnd(50, '='));
    console.log(`Migration Success Rate: ${successRate}% (${migratedSignatures}/${totalSourceSignatures})`);
    
    if (successRate < 100) {
      console.log(`\n💡 Recommendations:`);
      console.log(`  - Check migration logs for failed permissions`);
      console.log(`  - Verify policies exist in target before migrating permissions`);
      console.log(`  - Ensure collections exist in target schema`);
      console.log(`  - Check user permissions for creating permissions in target`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('💡 Tip: Make sure both Directus instances are running');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.error('💡 Tip: Check if your access tokens are valid and have permission to read permissions');
    }
    
    process.exit(1);
  }
}

// Run comparison
compareInstances();
