
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local (omitted for brevity, same as before)
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.replace(/\r/g, '').split('\n');
  lines.forEach((line, index) => {
    if (index === 0 && line.charCodeAt(0) === 0xFEFF) line = line.slice(1);
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^\s*([^=]+)\s*=\s*(.*)$/);
    if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        envConfig[key] = value;
    }
  });
}

const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  process.exit(1);
}

// Create client with default options
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seedUsers() {
  const email = 'testuser@gmail.com'; // Try a real domain
  const password = 'Password123!';

  console.log(`Attempting to sign up ${email}...`);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
        data: { name: 'Test User' }
    }
  });

  if (error) {
    console.error('Error signing up:', error);
  } else {
    console.log(`Sign up successful/initiated for: ${email}`);
    if (data.user) {
         console.log(`User created ID: ${data.user.id}`);
         if (data.session) {
             console.log('Session returned (email confirmed or not required).');
         } else {
             console.log('No session returned. Email confirmation likely required.');
         }
    }
  }
}

seedUsers();
