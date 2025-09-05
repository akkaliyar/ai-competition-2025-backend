import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
export class DatabaseSetupService implements OnModuleInit {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    // Don't block app startup - run database setup in background with delay
    setTimeout(() => {
      this.setupDatabase().catch(error => {
        // console.error('❌ Database setup failed:', error.message);
        // console.log('🚀 App will continue without database (health check will still work)');
      });
    }, 5000); // Wait 5 seconds after app starts before trying database
  }

  private async setupDatabase() {
    // console.log('🔧 Checking database setup...');
    
    try {
      // Check if tables exist and have the old problematic schema
      const queryRunner = this.dataSource.createQueryRunner();
      
      try {
        // Check if parsed_files table exists
        const tableExists = await queryRunner.hasTable('parsed_files');
        
        if (tableExists) {
          // console.log('📋 Checking parsed_files table schema...');
          
          // Get table schema
          const table = await queryRunner.getTable('parsed_files');
          const userAgentColumn = table?.findColumnByName('userAgent');
          
          // Check if userAgent is still VARCHAR(255) (problematic)
          if (userAgentColumn && userAgentColumn.type === 'varchar' && userAgentColumn.length === '255') {
            // console.log('⚠️  Detected problematic schema with large VARCHAR fields');
            // console.log('🔄 Recreating tables with optimized schema...');
            
            // Drop problematic tables
            await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
            await queryRunner.dropTable('table_extractions', true, true);
            await queryRunner.dropTable('ocr_results', true, true);
            await queryRunner.dropTable('file_metadata', true, true);
            await queryRunner.dropTable('parsed_files', true, true);
            await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
            
            // console.log('✅ Dropped old tables successfully');
            
            // Now synchronize with the new optimized schema
            // console.log('🔧 Creating optimized tables...');
            await this.dataSource.synchronize(false);
            
            // console.log('✅ Database setup completed with optimized schema!');
          } else {
            // console.log('✅ Database schema is already optimized');
          }
        } else {
          // console.log('📋 Tables don\'t exist, creating new ones...');
          await this.dataSource.synchronize(false);
          // console.log('✅ Database tables created successfully!');
        }
        
      } finally {
        await queryRunner.release();
      }
      
    } catch (error) {
      // console.error('❌ Database setup failed:', error.message);
      
      // If all else fails, provide manual instructions
      // console.log('');
      // console.log('🔧 Manual fix required:');
      // console.log('1. Connect to MySQL: mysql -u root -p');
      // console.log('2. Run: USE ai_crm;');
      // console.log('3. Run: SET FOREIGN_KEY_CHECKS = 0;');
      // console.log('4. Run: DROP TABLE IF EXISTS table_extractions;');
      // console.log('5. Run: DROP TABLE IF EXISTS ocr_results;');
      // console.log('6. Run: DROP TABLE IF EXISTS file_metadata;');
      // console.log('7. Run: DROP TABLE IF EXISTS parsed_files;');
      // console.log('8. Run: SET FOREIGN_KEY_CHECKS = 1;');
      // console.log('9. Restart the backend server');
    }
  }
}
