import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  Query,
} from '@nestjs/common';
import { BillExtractionService } from '../services/bill-extraction.service';
import { BillData, BillType, BillStatus } from '../entities/bill-data.entity';

@Controller('api/bills')
export class BillDataController {
  constructor(
    private readonly billExtractionService: BillExtractionService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllBills(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      let bills: BillData[] = [];

      if (type && Object.values(BillType).includes(type as BillType)) {
        bills = await this.billExtractionService.getBillDataByType(type as BillType);
      } else if (status && Object.values(BillStatus).includes(status as BillStatus)) {
        bills = await this.billExtractionService.getBillDataByStatus(status as BillStatus);
      } else {
        bills = await this.billExtractionService.getAllBillData();
      }

      // Apply limit if specified
      if (limit) {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          bills = bills.slice(0, limitNum);
        }
      }

      return {
        success: true,
        message: 'Bills retrieved successfully',
        data: bills,
        count: bills.length,
        filters: {
          type: type || 'all',
          status: status || 'all',
          limit: limit || 'unlimited'
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve bills',
        error: error.message
      };
    }
  }

  @Get('types')
  @HttpCode(HttpStatus.OK)
  async getBillTypes() {
    return {
      success: true,
      message: 'Bill types retrieved successfully',
      data: Object.values(BillType).map(type => ({
        value: type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        description: this.getBillTypeDescription(type)
      }))
    };
  }

  @Get('statuses')
  @HttpCode(HttpStatus.OK)
  async getBillStatuses() {
    return {
      success: true,
      message: 'Bill statuses retrieved successfully',
      data: Object.values(BillStatus).map(status => ({
        value: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
        description: this.getBillStatusDescription(status)
      }))
    };
  }

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getBillSummary() {
    try {
      const allBills = await this.billExtractionService.getAllBillData();
      
      // Calculate summary statistics
      const summary = {
        total: allBills.length,
        byType: {} as Record<BillType, number>,
        byStatus: {} as Record<BillStatus, number>,
        totalAmount: 0,
        averageAmount: 0,
        recentBills: 0
      };

      // Initialize counters
      Object.values(BillType).forEach(type => {
        summary.byType[type] = 0;
      });
      Object.values(BillStatus).forEach(status => {
        summary.byStatus[status] = 0;
      });

      // Calculate totals
      allBills.forEach(bill => {
        summary.byType[bill.billType]++;
        summary.byStatus[bill.billStatus]++;
        
        if (bill.totalAmount) {
          summary.totalAmount += bill.totalAmount;
        }

        // Count recent bills (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (bill.createdAt > thirtyDaysAgo) {
          summary.recentBills++;
        }
      });

      summary.averageAmount = summary.total > 0 ? summary.totalAmount / summary.total : 0;

      return {
        success: true,
        message: 'Bill summary retrieved successfully',
        data: summary
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve bill summary',
        error: error.message
      };
    }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getBillById(@Param('id', ParseIntPipe) id: number) {
    try {
      const bill = await this.billExtractionService.getBillDataById(id);
      
      if (!bill) {
        return {
          success: false,
          message: 'Bill not found',
          error: `No bill found with ID ${id}`
        };
      }

      return {
        success: true,
        message: 'Bill retrieved successfully',
        data: bill
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve bill',
        error: error.message
      };
    }
  }

  @Put(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateBillStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: BillStatus; notes?: string }
  ) {
    try {
      if (!body.status || !Object.values(BillStatus).includes(body.status)) {
        return {
          success: false,
          message: 'Invalid status provided',
          error: 'Status must be one of: ' + Object.values(BillStatus).join(', ')
        };
      }

      const updatedBill = await this.billExtractionService.updateBillStatus(
        id,
        body.status,
        body.notes
      );

      return {
        success: true,
        message: 'Bill status updated successfully',
        data: updatedBill
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update bill status',
        error: error.message
      };
    }
  }

  @Get('search/amount')
  @HttpCode(HttpStatus.OK)
  async searchBillsByAmount(
    @Query('min') minAmount?: string,
    @Query('max') maxAmount?: string,
    @Query('type') type?: string
  ) {
    try {
      const allBills = await this.billExtractionService.getAllBillData();
      let filteredBills = allBills;

      // Filter by amount range
      if (minAmount || maxAmount) {
        const min = minAmount ? parseFloat(minAmount) : 0;
        const max = maxAmount ? parseFloat(maxAmount) : Infinity;

        filteredBills = filteredBills.filter(bill => {
          if (!bill.totalAmount) return false;
          return bill.totalAmount >= min && bill.totalAmount <= max;
        });
      }

      // Filter by type
      if (type && Object.values(BillType).includes(type as BillType)) {
        filteredBills = filteredBills.filter(bill => bill.billType === type);
      }

      return {
        success: true,
        message: 'Bills filtered by amount successfully',
        data: filteredBills,
        count: filteredBills.length,
        filters: {
          minAmount: minAmount || 'unlimited',
          maxAmount: maxAmount || 'unlimited',
          type: type || 'all'
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to filter bills by amount',
        error: error.message
      };
    }
  }

  @Get('search/date')
  @HttpCode(HttpStatus.OK)
  async searchBillsByDate(
    @Query('start') startDate?: string,
    @Query('end') endDate?: string,
    @Query('type') type?: string
  ) {
    try {
      const allBills = await this.billExtractionService.getAllBillData();
      let filteredBills = allBills;

      // Filter by date range
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();

        filteredBills = filteredBills.filter(bill => {
          if (!bill.billDate) return false;
          return bill.billDate >= start && bill.billDate <= end;
        });
      }

      // Filter by type
      if (type && Object.values(BillType).includes(type as BillType)) {
        filteredBills = filteredBills.filter(bill => bill.billType === type);
      }

      return {
        success: true,
        message: 'Bills filtered by date successfully',
        data: filteredBills,
        count: filteredBills.length,
        filters: {
          startDate: startDate || 'unlimited',
          endDate: endDate || 'unlimited',
          type: type || 'all'
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to filter bills by date',
        error: error.message
      };
    }
  }

  private getBillTypeDescription(type: BillType): string {
    const descriptions = {
      [BillType.PAYSLIP]: 'Employee salary and compensation documents',
      [BillType.INVOICE]: 'Bills for goods or services provided',
      [BillType.RECEIPT]: 'Proof of payment received',
      [BillType.BILL]: 'General utility or service bills',
      [BillType.EXPENSE]: 'Expense reports and reimbursement documents',
      [BillType.OTHER]: 'Other financial documents'
    };
    return descriptions[type] || 'Unknown document type';
  }

  private getBillStatusDescription(status: BillStatus): string {
    const descriptions = {
      [BillStatus.PENDING]: 'Document uploaded, awaiting processing',
      [BillStatus.PROCESSED]: 'Data extracted, ready for verification',
      [BillStatus.VERIFIED]: 'Data verified by user',
      [BillStatus.APPROVED]: 'Document approved for payment/processing',
      [BillStatus.REJECTED]: 'Document rejected or needs correction'
    };
    return descriptions[status] || 'Unknown status';
  }
}
