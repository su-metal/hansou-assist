
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Lunar } = require('lunar-javascript');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
console.log('Env Path:', envPath);
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.replace(/\r/g, '').split('\n'); // Normalize line endings
  lines.forEach((line, index) => {
    // Remove BOM if present on first line
    if (index === 0 && line.charCodeAt(0) === 0xFEFF) {
        line = line.slice(1);
    }
    
    // Skip empty lines or comments
    if (!line || line.startsWith('#')) return;

    const match = line.match(/^\s*([^=]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      envConfig[key] = value;
    }
  });
} else {
    console.error('.env.local not found at', envPath);
    process.exit(1);
}

// Use Anon Key for this script (assuming RLS is disabled temporarily)
const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase credentials not found in .env.local');
  console.log('Loaded Keys:', Object.keys(envConfig));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const START_DATE = new Date('2024-01-01');
const END_DATE = new Date('2030-12-31');

const ROKUYO_MAP = {
  '先胜': '先勝',
  '友引': '友引',
  '先负': '先負', // Chinese '先负' -> Japanese '先負'
  '佛灭': '仏滅', // Chinese '佛灭' -> Japanese '仏滅'
  '大安': '大安',
  '赤口': '赤口'
};

async function seedRokuyo() {
  console.log('Starting Rokuyo seeding...');
  
  const rows = [];
  let currentDate = new Date(START_DATE);

  while (currentDate <= END_DATE) {
    const lunar = Lunar.fromDate(currentDate);
    const cnRokuyo = lunar.getLiuYao(); // e.g. '先胜'
    const jpRokuyo = ROKUYO_MAP[cnRokuyo] || cnRokuyo; // Fallback to raw if not mapped

    const dateStr = currentDate.toISOString().split('T')[0];
    
    rows.push({
      date: dateStr,
      rokuyo: jpRokuyo,
      is_tomobiki: jpRokuyo === '友引'
    });
    
    // Add 1 day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`Generated ${rows.length} rows.`);

  // Batch insert
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('rokuyo')
      .upsert(batch, { onConflict: 'date' });

    if (error) {
      console.error('Error inserting batch:', error);
      process.exit(1);
    } else {
      console.log(`Inserted batch ${i} - ${i + batch.length}`);
    }
  }

  console.log('Seeding completed.');
}

seedRokuyo().catch(e => console.error(e));
