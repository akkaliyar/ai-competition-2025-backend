const mysql = require('mysql2/promise');

// Test database connection and table creation
const testDatabaseTables = async () => {
  console.log('🧪 Testing Database Tables...\n');
  
  const dbConfig = {
    host: 'centerbeam.proxy.rlwy.net',
    port: 29313,
    user: 'root',
    password: 'UnBcEjiANcIQtIxcvPeKIaePOZjiwrzE',
    database: 'railway',
    connectTimeout: 30000,
    acquireTimeout: 30000,
    timeout: 30000,
  };

  try {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connection successful!');
    
    // Check if tables exist
    console.log('🔍 Checking for required tables...');
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('📋 Available tables:', tableNames);
    
    // Check for specific required tables
    const requiredTables = ['parsed_files', 'file_metadata', 'ocr_results', 'table_extractions', 'bill_data'];
    const missingTables = requiredTables.filter(table => !tableNames.includes(table));
    
    if (missingTables.length === 0) {
      console.log('✅ All required tables exist!');
      
      // Check table structure
      for (const table of requiredTables) {
        console.log(`\n📊 Table: ${table}`);
        const [columns] = await connection.execute(`DESCRIBE ${table}`);
        console.log('Columns:', columns.map(c => `${c.Field} (${c.Type})`).join(', '));
      }
    } else {
      console.log('❌ Missing tables:', missingTables);
      console.log('💡 Tables need to be created by the application');
    }
    
    await connection.end();
    console.log('\n🎯 Database test completed!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('🔍 Error details:', error);
  }
};

// Run the test
testDatabaseTables();
