const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local manually
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
const serviceRoleKey = envConfig['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create client with service role key to bypass RLS
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function syncUsers() {
  console.log('Fetching auth users...');
  
  // Use auth.admin.listUsers() to get all users
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error('Error fetching auth users:', authError);
    return;
  }

  console.log(`Found ${users.length} auth users.`);

  for (const user of users) {
    // Check if user exists in public.users
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error(`Error checking user ${user.id}:`, fetchError);
      continue;
    }

    if (!existingUser) {
      console.log(`Syncing user ${user.id} (${user.email})...`);
      
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          name: user.user_metadata?.name || user.email.split('@')[0],
          role: 'driver', // Default role
          // phone: user.phone || null,
          is_active: true
        });

      if (insertError) {
        console.error(`Failed to insert user ${user.id}:`, insertError);
      } else {
        console.log(`Successfully synced user ${user.id}`);
      }
    } else {
      console.log(`User ${user.id} already exists in public.users.`);
    }
  }
}

syncUsers().catch(console.error);
