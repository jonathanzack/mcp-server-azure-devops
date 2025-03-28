#!/usr/bin/env node
/**
 * Enhanced script to test Azure DevOps API endpoints
 * This tests the same endpoints used by the listOrganizations function
 * Supports both PAT and Azure CLI authentication methods
 */

const axios = require('axios');
const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Test the profile endpoint
async function testProfileEndpoint(authHeader) {
  console.log('\nTesting profile endpoint...');
  console.log('URL: https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0');
  console.log('Authorization header type:', authHeader.split(' ')[0]);
  
  try {
    console.log('Making request...');
    const response = await axios.get(
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0',
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
        validateStatus: null, // Don't throw on any status code
      }
    );
    
    console.log('Response received with status:', response.status);
    
    if (response.status === 200) {
      console.log('✅ Profile endpoint accessible!');
      console.log('Public alias:', response.data.publicAlias);
      return response.data.publicAlias;
    } else {
      console.log('❌ Error accessing profile endpoint:');
      console.log('Status:', response.status);
      console.log('Headers:', JSON.stringify(response.headers, null, 2));
      console.log('Data:', JSON.stringify(response.data, null, 2));
      return null;
    }
  } catch (error) {
    console.log('❌ Error accessing profile endpoint:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Headers:', JSON.stringify(error.response.headers, null, 2));
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('No response received. Network error or endpoint unavailable.');
      console.log('Error details:', error.message);
    } else {
      console.log('Error:', error.message);
    }
    return null;
  }
}

// Test the organizations endpoint
async function testOrgsEndpoint(authHeader, publicAlias) {
  if (!publicAlias) {
    console.log('\n❌ Cannot test organizations endpoint without publicAlias');
    return;
  }
  
  console.log('\nTesting organizations endpoint...');
  console.log(`URL: https://app.vssps.visualstudio.com/_apis/accounts?memberId=${publicAlias}&api-version=6.0`);
  
  try {
    const response = await axios.get(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${publicAlias}&api-version=6.0`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      }
    );
    
    console.log('✅ Organizations endpoint accessible!');
    console.log('Response status:', response.status);
    console.log('Number of organizations:', response.data.value.length);
    if (response.data.value.length > 0) {
      console.log('Organizations:', response.data.value.map(org => org.accountName).join(', '));
    } else {
      console.log('No organizations found for this user.');
    }
  } catch (error) {
    console.log('❌ Error accessing organizations endpoint:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('No response received. Network error or endpoint unavailable.');
      console.log('Error details:', error.message);
    } else {
      console.log('Error:', error.message);
    }
  }
}

// Create a Basic Auth header for PAT authentication
function createBasicAuthHeader(pat) {
  console.log('Creating Basic Auth header...');
  // Check if PAT has the correct format (no username:password format)
  if (pat.includes(':')) {
    console.log('⚠️ WARNING: PAT contains colon character. This is unusual and might indicate incorrect format.');
  }
  
  // Azure DevOps expects PATs in the format `:pat` when Base64 encoding
  const token = Buffer.from(`:${pat}`).toString('base64');
  return `Basic ${token}`;
}

// Get Azure CLI token
async function getAzureCliToken() {
  try {
    console.log('Attempting to get Azure CLI token...');
    
    // Check if Azure CLI is installed
    try {
      execSync('az --version', { stdio: 'ignore' });
    } catch (error) {
      console.log('❌ Azure CLI not installed or not in PATH');
      return null;
    }
    
    // Check if user is logged in
    try {
      const accountInfo = JSON.parse(execSync('az account show', { encoding: 'utf8' }));
      console.log('✅ Azure CLI logged in as:', accountInfo.user.name);
    } catch (error) {
      console.log('❌ Not logged in to Azure CLI. Please run "az login" first.');
      return null;
    }
    
    // Get token for Azure DevOps
    try {
      const tokenInfo = JSON.parse(
        execSync(
          'az account get-access-token --resource "499b84ac-1321-427f-aa17-267ca6975798"',
          { encoding: 'utf8' }
        )
      );
      
      console.log('✅ Successfully acquired Azure CLI token');
      return `Bearer ${tokenInfo.accessToken}`;
    } catch (error) {
      console.log('❌ Failed to get Azure CLI token:', error.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Error in Azure CLI authentication:', error.message);
    return null;
  }
}

// Check for environment variables
function checkEnvironmentVariables() {
  console.log('\nChecking environment variables...');
  
  // Try to load from .env file
  try {
    if (fs.existsSync(path.join(process.cwd(), '.env'))) {
      require('dotenv').config();
      console.log('✅ Found and loaded .env file');
    }
  } catch (error) {
    console.log('⚠️ Error loading .env file:', error.message);
  }
  
  const vars = [
    'AZURE_DEVOPS_ORG_URL',
    'AZURE_DEVOPS_AUTH_METHOD',
    'AZURE_DEVOPS_PAT',
    'AZURE_DEVOPS_DEFAULT_PROJECT'
  ];
  
  let allPresent = true;
  
  vars.forEach(varName => {
    if (process.env[varName]) {
      if (varName === 'AZURE_DEVOPS_PAT') {
        const pat = process.env[varName];
        console.log(`✅ ${varName}: Set (length: ${pat.length} characters)`);
        
        // Check for common PAT issues
        if (pat.length < 30) {
          console.log(`   ⚠️ WARNING: PAT seems too short (${pat.length} chars). Azure DevOps PATs are typically longer.`);
        }
        if (pat.includes(' ')) {
          console.log('   ⚠️ WARNING: PAT contains spaces. This might cause authentication issues.');
        }
      } else {
        console.log(`✅ ${varName}: Set`);
        if (varName === 'AZURE_DEVOPS_AUTH_METHOD') {
          console.log(`   Value: ${process.env[varName]}`);
        } else if (varName === 'AZURE_DEVOPS_ORG_URL') {
          console.log(`   Value: ${process.env[varName]}`);
        }
      }
    } else {
      console.log(`❌ ${varName}: Not set`);
      allPresent = false;
    }
  });
  
  return allPresent;
}

// Test network connectivity
function testNetworkConnectivity() {
  console.log('\nTesting network connectivity...');
  
  const endpoints = [
    'app.vssps.visualstudio.com',
    'dev.azure.com'
  ];
  
  endpoints.forEach(endpoint => {
    try {
      execSync(`ping -c 1 ${endpoint}`, { stdio: 'ignore' });
      console.log(`✅ Can reach ${endpoint}`);
    } catch (error) {
      console.log(`❌ Cannot reach ${endpoint}`);
    }
  });
}

// Main function
async function main() {
  console.log('Azure DevOps API Endpoint Tester');
  console.log('===============================');
  
  // Check environment variables
  const envVarsPresent = checkEnvironmentVariables();
  
  // Test network connectivity
  testNetworkConnectivity();
  
  rl.question('\nChoose authentication method:\n1. Personal Access Token (PAT)\n2. Azure CLI\nEnter choice (1/2): ', async (choice) => {
    let authHeader;
    
    if (choice === '1') {
      // PAT authentication
      const defaultPat = process.env.AZURE_DEVOPS_PAT || '';
      rl.question(`Enter your Personal Access Token (PAT)${defaultPat ? ' [press Enter to use from .env]' : ''}: `, async (pat) => {
        pat = pat || defaultPat;
        
        if (!pat) {
          console.log('❌ PAT is required');
          rl.close();
          return;
        }
        
        authHeader = createBasicAuthHeader(pat);
        
        // Test the endpoints
        const publicAlias = await testProfileEndpoint(authHeader);
        await testOrgsEndpoint(authHeader, publicAlias);
        
        rl.close();
      });
    } else if (choice === '2') {
      // Azure CLI authentication
      authHeader = await getAzureCliToken();
      
      if (!authHeader) {
        console.log('❌ Failed to get Azure CLI token');
        rl.close();
        return;
      }
      
      // Test the endpoints
      const publicAlias = await testProfileEndpoint(authHeader);
      await testOrgsEndpoint(authHeader, publicAlias);
      
      rl.close();
    } else {
      console.log('❌ Invalid choice');
      rl.close();
    }
  });
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
