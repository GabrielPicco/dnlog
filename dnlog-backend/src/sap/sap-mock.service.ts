import { Injectable, Logger } from '@nestjs/common';

/**
 * Mock do SAP Service Layer.
 *
 * Quando USE_MOCK=true, este service substitui o SapClientService real.
 * Permite desenvolver e demonstrar o DNLog SEM precisar do SAP de verdade.
 *
 * Dados sao mantidos em memoria. Reset ocorre quando o backend reinicia.
 */
@Injectable()
export class SapMockService {
  private readonly logger = new Logger(SapMockService.name);

  // Pedidos de venda fake (espelhando estrutura SAP real)
  private pedidos = this.gerarPedidosFake();

  // Delivery Notes criadas (acumula durante a execucao)
  private deliveryNotes: any[] = [];
  private purchaseOrders: any[] = [];
  private proximoDocEntry = 1000;
  private proximoDocNum = 50000;

  async login(): Promise<void> {
    this.logger.log('MOCK: login simulado OK');
  }

  async getPedidosAbertos(): Promise<any[]> {
    this.logger.log(`MOCK: retornando ${this.pedidos.length} pedidos`);
    return this.pedidos.filter(p => p.DocumentStatus === 'bost_Open');
  }

  async getResumoEntregas(): Promise<{ entregues: number; nao_entregues: number }> {
    return { entregues: 8, nao_entregues: 5 };
  }

  async getPedidosCompraAbertos(): Promise<any[]> {
    return [
      {
        DocEntry: 201, DocNum: 5001, DocDate: '2026-05-01', DocDueDate: '2026-05-25',
        CardCode: 'F00001', CardName: 'ELIANE SEMENTES', DocTotal: 33000,
        DocumentStatus: 'bost_Open', Comments: 'Compra para triangular',
        DocumentLines: [
          { LineNum: 0, ItemCode: 'SOJ000015', ItemDescription: 'SOJA NEO 811 IPRO', Quantity: 30, OpenQuantity: 30, Price: 1100, WarehouseCode: 'DN_EST' },
        ],
      },
      {
        DocEntry: 202, DocNum: 5002, DocDate: '2026-05-08', DocDueDate: '2026-05-30',
        CardCode: 'F00003', CardName: 'SLC SEMENTES', DocTotal: 24000,
        DocumentStatus: 'bost_Open', Comments: '',
        DocumentLines: [
          { LineNum: 0, ItemCode: 'SOJ000023', ItemDescription: 'SOJA BRAUNA IPRO', Quantity: 20, OpenQuantity: 12, Price: 1000, WarehouseCode: 'DN_EST' },
        ],
      },
    ];
  }

  async getBusinessPartners(type: 'cCustomer' | 'cSupplier'): Promise<any[]> {
    if (type === 'cCustomer') {
      return [
        { CardCode: 'C00001', CardName: 'KOITI ORITA', FederalTaxID: '123.456.789-00', Phone1: '(77) 99999-0001' },
        { CardCode: 'C00002', CardName: 'GILSON OSMAR DENARDIN', FederalTaxID: '987.654.321-00', Phone1: '(77) 99999-0002' },
        { CardCode: 'C00003', CardName: 'IVANOR JOSE GUERRA', FederalTaxID: '456.789.123-00', Phone1: '(77) 99999-0003' },
        { CardCode: 'C00004', CardName: 'RAFAEL ABRAHAMS KLIEWER', FederalTaxID: '789.123.456-00', Phone1: '(77) 99999-0004' },
        { CardCode: 'C00005', CardName: 'CARLOS ANTONIO CASALI', FederalTaxID: '321.654.987-00', Phone1: '(77) 99999-0005' },
        { CardCode: 'C00006', CardName: 'JUSTINO PIVETTA', FederalTaxID: '654.987.321-00', Phone1: '(77) 99999-0006' },
      ];
    }
    return [
      { CardCode: 'F00001', CardName: 'ELIANE SEMENTES', FederalTaxID: '11.111.111/0001-11', BPAddresses: [{ AddressType: 'bo_ShipTo', Street: 'Rod. BR-242', StreetNo: 'KM 30', City: 'Luís Eduardo Magalhães', State: 'BA', ZipCode: '47850-000' }] },
      { CardCode: 'F00002', CardName: 'BOA SAFRA', FederalTaxID: '22.222.222/0001-22', BPAddresses: [{ AddressType: 'bo_BillTo', Street: 'Av. Principal', StreetNo: '1000', City: 'Formosa', State: 'GO', ZipCode: '73800-000' }] },
      { CardCode: 'F00003', CardName: 'SLC SEMENTES', FederalTaxID: '33.333.333/0001-33', BPAddresses: [{ Street: 'Fazenda Pamplona', City: 'Cristalina', State: 'GO', ZipCode: '73850-000' }] },
      { CardCode: 'F00004', CardName: 'SJ SEEDS', FederalTaxID: '44.444.444/0001-44', BPAddresses: [] },
      { CardCode: 'F00005', CardName: 'SEEDCORP', FederalTaxID: '55.555.555/0001-55', BPAddresses: [{ Street: 'Distrito Industrial', City: 'Barreiras', State: 'BA' }] },
    ];
  }

  async getItems(): Promise<any[]> {
    return [
      { ItemCode: 'SOJ000015', ItemName: 'SOJA NEO 811 IPRO', ItemsGroupCode: 100, ManageBatchNumbers: 'tYES', U_CULTIVAR: 'NEO 811' },
      { ItemCode: 'SOJ000023', ItemName: 'SOJA BRAUNA IPRO', ItemsGroupCode: 100, ManageBatchNumbers: 'tYES', U_CULTIVAR: 'BRAUNA' },
      { ItemCode: 'SOJ000031', ItemName: 'SOJA HERA IPRO', ItemsGroupCode: 100, ManageBatchNumbers: 'tYES', U_CULTIVAR: 'HERA' },
      { ItemCode: 'SOJ000048', ItemName: 'SOJA ITAUBA IPRO', ItemsGroupCode: 100, ManageBatchNumbers: 'tYES', U_CULTIVAR: 'ITAUBA' },
    ];
  }

  async getBatchesForItem(itemCode: string): Promise<any[]> {
    const map = {
      'SOJ000015': [
        { BatchNumber: 'NEO2026276804', ItemCode: itemCode, Quantity: 50, U_PENEIRA: '8.5', U_GERMINACAO: 93 },
        { BatchNumber: 'NEO2026810458', ItemCode: itemCode, Quantity: 30, U_PENEIRA: '8.0', U_GERMINACAO: 91 },
      ],
      'SOJ000023': [
        { BatchNumber: 'BRA2026261449', ItemCode: itemCode, Quantity: 80, U_PENEIRA: '7.5', U_GERMINACAO: 89 },
      ],
      'SOJ000031': [
        { BatchNumber: 'HER2026744287', ItemCode: itemCode, Quantity: 40, U_PENEIRA: '8.5', U_GERMINACAO: 94 },
      ],
    };
    return map[itemCode] || [];
  }

  async getItemGroups(): Promise<any[]> {
    return [
      { Number: 100, GroupName: 'SOJA' },
      { Number: 101, GroupName: 'SORGO' },
      { Number: 102, GroupName: 'BRAQUIARIA' },
      { Number: 103, GroupName: 'MIX' },
    ];
  }

  async getSalesPersons(): Promise<any[]> {
    return [
      { SalesEmployeeCode: 1, SalesEmployeeName: 'LOURIVAL' },
      { SalesEmployeeCode: 2, SalesEmployeeName: 'MARCELO' },
      { SalesEmployeeCode: 3, SalesEmployeeName: 'EDUARDO' },
    ];
  }

  async getWarehouses(): Promise<any[]> {
    return [
      { WarehouseCode: 'DN_EST', WarehouseName: 'DNSeeds - Estoque Geral' },
      { WarehouseCode: 'DN_DETER', WarehouseName: 'DNSeeds - DE Terceiros' },
      { WarehouseCode: '01', WarehouseName: 'Deposito geral' },
    ];
  }

  async getEstoque(): Promise<any[]> {
    return [
      {
        ItemCode: 'SOJ000015', ItemName: 'SOJA NEO 811 IPRO', ItemsGroupCode: 100,
        ManageBatchNumbers: 'tYES', QuantityOnStock: 80,
        ItemWarehouseInfoCollection: [
          { WarehouseCode: 'DN_EST', InStock: 80, Committed: 27 },
          { WarehouseCode: 'DN_DETER', InStock: 0, Committed: 0 },
        ],
      },
      {
        ItemCode: 'SOJ000023', ItemName: 'SOJA BRAUNA IPRO', ItemsGroupCode: 100,
        ManageBatchNumbers: 'tYES', QuantityOnStock: 80,
        ItemWarehouseInfoCollection: [
          { WarehouseCode: 'DN_EST', InStock: 80, Committed: 16 },
        ],
      },
      {
        ItemCode: 'SOJ000031', ItemName: 'SOJA HERA IPRO', ItemsGroupCode: 100,
        ManageBatchNumbers: 'tYES', QuantityOnStock: 40,
        ItemWarehouseInfoCollection: [
          { WarehouseCode: '01', InStock: 40, Committed: 0 },
        ],
      },
    ];
  }

  async createDeliveryNote(payload: any): Promise<any> {
    const docEntry = this.proximoDocEntry++;
    const docNum = this.proximoDocNum++;
    const dn = {
      ...payload,
      DocEntry: docEntry,
      DocNum: docNum,
      DocDate: new Date().toISOString().split('T')[0],
      DocumentStatus: 'bost_Open',
    };
    this.deliveryNotes.push(dn);

    // BAIXA NOS PEDIDOS DE VENDA — simulando o efeito real do SAP
    if (payload.DocumentLines) {
      for (const line of payload.DocumentLines) {
        if (line.BaseEntry && line.BaseLine !== undefined) {
          const ped = this.pedidos.find(p => p.DocEntry === line.BaseEntry);
          if (ped) {
            const l = ped.DocumentLines.find(ll => ll.LineNum === line.BaseLine);
            if (l) {
              l.OpenQuantity = Math.max(0, l.OpenQuantity - line.Quantity);
              if (l.OpenQuantity === 0) l.LineStatus = 'bost_Close';
            }
            // Se todas as linhas zeraram, pedido fica fechado
            const todasZeradas = ped.DocumentLines.every(ll => ll.OpenQuantity === 0);
            if (todasZeradas) ped.DocumentStatus = 'bost_Close';
          }
        }
      }
    }

    this.logger.log(`MOCK: Delivery Note criada DocNum=${docNum}, baixou estoque dos pedidos vinculados`);
    return dn;
  }

  async createPurchaseOrder(payload: any): Promise<any> {
    const po = {
      ...payload,
      DocEntry: this.proximoDocEntry++,
      DocNum: this.proximoDocNum++,
      DocDate: new Date().toISOString().split('T')[0],
      DocumentStatus: 'bost_Open',
    };
    this.purchaseOrders.push(po);
    this.logger.log(`MOCK: Purchase Order criada DocNum=${po.DocNum}`);
    return po;
  }

  /**
   * Gera pedidos fake replicando a estrutura real SAP B1.
   */
  private gerarPedidosFake() {
    return [
      {
        DocEntry: 101, DocNum: 12345, DocDate: '2026-04-15', DocDueDate: '2026-05-25',
        CardCode: 'C00001', CardName: 'KOITI ORITA', DocTotal: 187500.0,
        DocumentStatus: 'bost_Open', Comments: 'Entrega Fazenda Tres Irmaos',
        U_VENDEDOR: 'LOURIVAL',
        DocumentLines: [
          { LineNum: 0, ItemCode: 'SOJ000015', ItemDescription: 'SOJA NEO 811 IPRO', Quantity: 15, OpenQuantity: 15, Price: 1250, WarehouseCode: 'WH-01', LineStatus: 'bost_Open' },
          { LineNum: 1, ItemCode: 'SOJ000023', ItemDescription: 'SOJA BRAUNA IPRO', Quantity: 10, OpenQuantity: 10, Price: 1180, WarehouseCode: 'WH-01', LineStatus: 'bost_Open' },
        ],
      },
      {
        DocEntry: 102, DocNum: 12346, DocDate: '2026-04-20', DocDueDate: '2026-05-22',
        CardCode: 'C00003', CardName: 'IVANOR JOSE GUERRA', DocTotal: 220500.0,
        DocumentStatus: 'bost_Open', Comments: 'Urgente - plantio',
        U_VENDEDOR: 'MARCELO',
        DocumentLines: [
          { LineNum: 0, ItemCode: 'SOJ000031', ItemDescription: 'SOJA HERA IPRO', Quantity: 25, OpenQuantity: 25, Price: 1320, WarehouseCode: 'WH-02', LineStatus: 'bost_Open' },
        ],
      },
      {
        DocEntry: 103, DocNum: 12347, DocDate: '2026-05-01', DocDueDate: '2026-05-30',
        CardCode: 'C00004', CardName: 'RAFAEL ABRAHAMS KLIEWER', DocTotal: 158400.0,
        DocumentStatus: 'bost_Open', Comments: 'Triangular via SJ Seeds',
        U_VENDEDOR: 'LOURIVAL',
        DocumentLines: [
          { LineNum: 0, ItemCode: 'SOJ000048', ItemDescription: 'SOJA ITAUBA IPRO', Quantity: 12, OpenQuantity: 12, Price: 1320, WarehouseCode: 'WH-03', LineStatus: 'bost_Open' },
        ],
      },
      {
        DocEntry: 104, DocNum: 12348, DocDate: '2026-05-10', DocDueDate: '2026-06-05',
        CardCode: 'C00005', CardName: 'CARLOS ANTONIO CASALI', DocTotal: 267850.0,
        DocumentStatus: 'bost_Open', Comments: '',
        U_VENDEDOR: 'EDUARDO',
        DocumentLines: [
          { LineNum: 0, ItemCode: 'SOJ000015', ItemDescription: 'SOJA NEO 811 IPRO', Quantity: 27, OpenQuantity: 27, Price: 1250, WarehouseCode: 'WH-01', LineStatus: 'bost_Open' },
        ],
      },
      {
        DocEntry: 105, DocNum: 12349, DocDate: '2026-05-12', DocDueDate: '2026-05-21',
        CardCode: 'C00006', CardName: 'JUSTINO PIVETTA', DocTotal: 173600.0,
        DocumentStatus: 'bost_Open', Comments: 'Sem prazo definido',
        U_VENDEDOR: 'MARCELO',
        DocumentLines: [
          { LineNum: 0, ItemCode: 'SOJ000023', ItemDescription: 'SOJA BRAUNA IPRO', Quantity: 16, OpenQuantity: 16, Price: 1180, WarehouseCode: 'WH-01', LineStatus: 'bost_Open' },
        ],
      },
    ];
  }
}
