import { Response } from 'express';
import { hierarchyService } from '../services/hierarchyService.ts';
import { postgresClientMappingRepository } from '../repositories/PostgresClientMappingRepository.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import type { InternalAuthorizedRequest } from '../auth/internalAuth.ts';

export class HierarchyController {
  // Masters
  public async listMasters(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const masters = await hierarchyService.getScopedEntities(req.user as any, 'MASTER');
      res.json({ success: true, data: masters });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async createMaster(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { fullName, userId, email, mobile, countryCode, password, company, address, commissionRate } = req.body;
      if (!fullName || !userId || !mobile) {
        res.status(400).json({ success: false, message: 'Full name, User ID, and Mobile are required.' });
        return;
      }

      const master = await hierarchyService.createMaster(req.user as any, {
        fullName,
        userId,
        email,
        mobile,
        countryCode,
        password,
        company,
        address,
        commissionRate,
      });

      res.status(201).json({ success: true, data: master, message: 'Master account created successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }

  public async getMasterById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const master = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!master || master.role !== 'MASTER') {
        res.status(404).json({ success: false, message: 'Master not found' });
        return;
      }
      res.json({ success: true, data: master });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async updateMasterStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { status } = req.body;
      if (!['active', 'suspended', 'deactivated'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status value' });
        return;
      }

      const updated = await hierarchyService.updateEntityStatus(req.user as any, req.params.id, status);
      res.json({ success: true, data: updated, message: `Master status updated to ${status}` });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }

  // Brokers
  public async listBrokers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const brokers = await hierarchyService.getScopedEntities(req.user as any, 'BROKER');
      res.json({ success: true, data: brokers });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async createBroker(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { fullName, userId, email, mobile, countryCode, password, parentId, company, address, commissionRate } = req.body;
      if (!fullName || !userId || !mobile || !parentId) {
        res.status(400).json({ success: false, message: 'Full name, User ID, Mobile, and Parent Master are required.' });
        return;
      }

      const broker = await hierarchyService.createBroker(req.user as any, {
        fullName,
        userId,
        email,
        mobile,
        countryCode,
        password,
        parentId,
        company,
        address,
        commissionRate,
      });

      res.status(201).json({ success: true, data: broker, message: 'Broker created successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }

  public async getBrokerById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const broker = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!broker || broker.role !== 'BROKER') {
        res.status(404).json({ success: false, message: 'Broker not found' });
        return;
      }
      res.json({ success: true, data: broker });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async updateBrokerStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { status } = req.body;
      if (!['active', 'suspended', 'deactivated'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status value' });
        return;
      }

      const updated = await hierarchyService.updateEntityStatus(req.user as any, req.params.id, status);
      res.json({ success: true, data: updated, message: `Broker status updated to ${status}` });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }

  // Sub-Brokers
  public async listSubBrokers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const subBrokers = await hierarchyService.getScopedEntities(req.user as any, 'SUB_BROKER');
      res.json({ success: true, data: subBrokers });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async createSubBroker(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { fullName, userId, email, mobile, countryCode, password, parentId, company, address, commissionRate } = req.body;
      if (!fullName || !userId || !mobile || !parentId) {
        res.status(400).json({ success: false, message: 'Full name, User ID, Mobile, and Parent Broker are required.' });
        return;
      }

      const subBroker = await hierarchyService.createSubBroker(req.user as any, {
        fullName,
        userId,
        email,
        mobile,
        countryCode,
        password,
        parentId,
        company,
        address,
        commissionRate,
      });

      res.status(201).json({ success: true, data: subBroker, message: 'Sub-Broker created successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }

  public async getSubBrokerById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const subBroker = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!subBroker || subBroker.role !== 'SUB_BROKER') {
        res.status(404).json({ success: false, message: 'Sub-Broker not found' });
        return;
      }
      res.json({ success: true, data: subBroker });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async updateSubBrokerStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { status } = req.body;
      if (!['active', 'suspended', 'deactivated'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status value' });
        return;
      }

      const updated = await hierarchyService.updateEntityStatus(req.user as any, req.params.id, status);
      res.json({ success: true, data: updated, message: `Sub-Broker status updated to ${status}` });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }

  // Clients
  public async listClients(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const rawAccountType = ((req.query.account_type as string) || 'all').toLowerCase().trim();
      const accountType = (['real', 'demo'].includes(rawAccountType) ? rawAccountType : 'all') as 'all' | 'real' | 'demo';

      const clients = await postgresClientMappingRepository.getClients({
        caller: req.user as any,
        accountType,
      });

      res.json({ success: true, data: clients });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public async assignClientHierarchy(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { brokerId, subBrokerId } = req.body;

      const result = await hierarchyService.assignClientHierarchy(req.user as any, id, {
        brokerId,
        subBrokerId,
      });

      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }

  // S2S Internal Sync Handler
  public async syncHierarchyNode(req: InternalAuthorizedRequest, res: Response): Promise<void> {
    try {
      const result = await hierarchyService.syncFromCentralAdmin(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
}

export const hierarchyController = new HierarchyController();

