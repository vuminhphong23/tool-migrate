/**
 * Permission Verification Script
 * 
 * Usage:
 * node verify-permissions.js <target-url> <target-token> [collection] [action]
 * 
 * Examples:
 * node verify-permissions.js http://localhost:8055 your-token
 * node verify-permissions.js http://localhost:8055 your-token news_listing
 * node verify-permissions.js http://localhost:8055 your-token news_listing read
 */

const https = require('https');
const http = require('http');
const url = require('url');

// Command line arguments
const [,, targetUrl, targetToken, filterCollection, filterAction] = process.argv;

if (!targetUrl || !targetToken) {
  console.error('❌ Usage: node verify-permissions.js <target-url> <target-token> [collection] [action]');
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

// Main verification function
async function verifyPermissions() {
  try {
    console.log('🔍 Verifying permissions...');
    console.log(`📍 Target: ${targetUrl}`);
    console.log(`🔑 Token: ${targetToken.substring(0, 10)}...`);
    
    if (filterCollection) {
      console.log(`📂 Collection Filter: ${filterCollection}`);
    }
    if (filterAction) {
      console.log(`⚡ Action Filter: ${filterAction}`);
    }
    console.log('');

    // Fetch permissions
    const permissionsUrl = `${targetUrl}/permissions?limit=-1`;
    const response = await makeRequest(permissionsUrl, targetToken);
    
    const permissions = response.data || response || [];
    
    if (!Array.isArray(permissions)) {
      throw new Error('Invalid permissions response format');
    }

    console.log(`✅ Loaded ${permissions.length} total permissions`);
    console.log('');

    // Apply filters
    let filteredPermissions = permissions;
    
    if (filterCollection) {
      filteredPermissions = filteredPermissions.filter(p => 
        p.collection === filterCollection
      );
      console.log(`📂 Filtered by collection '${filterCollection}': ${filteredPermissions.length} permissions`);
    }
    
    if (filterAction) {
      filteredPermissions = filteredPermissions.filter(p => 
        p.action === filterAction
      );
      console.log(`⚡ Filtered by action '${filterAction}': ${filteredPermissions.length} permissions`);
    }

    if (filteredPermissions.length === 0) {
      console.log('❌ No permissions found matching the criteria');
      return;
    }

    console.log('');
    console.log('📋 Permission Details:');
    console.log(''.padEnd(80, '='));

    // Group by collection
    const byCollection = {};
    filteredPermissions.forEach(permission => {
      if (!byCollection[permission.collection]) {
        byCollection[permission.collection] = [];
      }
      byCollection[permission.collection].push(permission);
    });

    // Display results
    Object.keys(byCollection).sort().forEach(collection => {
      console.log(`\n📂 Collection: ${collection}`);
      console.log(''.padEnd(50, '-'));
      
      byCollection[collection].forEach(permission => {
        console.log(`  🔑 ID: ${permission.id}`);
        console.log(`  ⚡ Action: ${permission.action}`);
        console.log(`  🔐 Policy: ${permission.policy || 'None'}`);
        
        if (permission.fields) {
          console.log(`  📝 Fields: ${permission.fields.join(', ')}`);
        } else {
          console.log(`  📝 Fields: All fields`);
        }
        
        const rules = [];
        if (permission.permissions) rules.push('Permissions');
        if (permission.validation) rules.push('Validation');
        if (permission.presets) rules.push('Presets');
        
        if (rules.length > 0) {
          console.log(`  📏 Rules: ${rules.join(', ')}`);
        }
        
        console.log('');
      });
    });

    // Summary statistics
    console.log('📊 Summary:');
    console.log(''.padEnd(50, '='));
    console.log(`Total Permissions: ${filteredPermissions.length}`);
    console.log(`Collections: ${Object.keys(byCollection).length}`);
    
    const actions = [...new Set(filteredPermissions.map(p => p.action))];
    console.log(`Actions: ${actions.length} (${actions.join(', ')})`);
    
    const withPolicy = filteredPermissions.filter(p => p.policy).length;
    const withoutPolicy = filteredPermissions.length - withPolicy;
    console.log(`With Policy: ${withPolicy}`);
    console.log(`Without Policy (Orphaned): ${withoutPolicy}`);
    
    const withRules = filteredPermissions.filter(p => 
      p.permissions || p.validation || p.presets
    ).length;
    console.log(`With Rules: ${withRules}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('💡 Tip: Make sure the target Directus instance is running');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.error('💡 Tip: Check if your access token is valid and has permission to read permissions');
    }
    
    process.exit(1);
  }
}

// Run verification
verifyPermissions();
