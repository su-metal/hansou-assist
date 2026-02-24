const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.replace(/\r/g, '').split('\n');
  lines.forEach((line) => {
    const match = line.match(/^\s*([^=]+)\s*=\s*(.*)$/);
    if (match) {
        envConfig[match[1].trim()] = match[2].trim();
    }
  });
}

const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseAnonKey = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkYasuragi() {
    console.log('Checking JA蒲郡市やすらぎセンター settings...');
    const { data, error } = await supabase
        .from('facilities')
        .select('*')
        .eq('name', 'JA蒲郡市やすらぎセンター')
        .single();
        
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Facility Data:', JSON.stringify(data, null, 2));
    }
}

checkYasuragi();
