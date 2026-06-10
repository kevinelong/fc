/* TPOS platform — ONE shared mock dataset, viewed by every role.
   The same trailer is inventory to the manager, a deal to sales, a work order to
   service, an invoice to the bookkeeper, and a listing to the customer. */
window.TPOS = (function () {
  const money = n => '$' + Math.round(n).toLocaleString();
  const k = n => '$' + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k';
  const ago = d => { const days = Math.round((Date.now() - d) / 864e5); return days <= 0 ? 'today' : days === 1 ? '1d ago' : days + 'd ago'; };
  const D = (daysAgo) => Date.now() - daysAgo * 864e5;

  // --- the tenant (the trailer dealership using TPOS) ---
  const tenant = { name: 'Ironline Trailer Co.', plan: 'Growth (Hosted)', city: 'Springfield, IL', since: 2009, lots: ['Main Yard', 'North Lot'] };

  // --- staff (every role) ---
  const users = [
    { id: 'u1', name: 'Dale Withers', role: 'Owner / Dealer Principal', init: 'DW', color: '#ff7a18' },
    { id: 'u2', name: 'Marcy Lane', role: 'Lead Generation', init: 'ML', color: '#3a9bc9' },
    { id: 'u3', name: 'Rick Alvarez', role: 'Salesperson', init: 'RA', color: '#3ecf8e' },
    { id: 'u4', name: 'Tonya Brooks', role: 'Salesperson', init: 'TB', color: '#8a6dc2' },
    { id: 'u5', name: 'Sam Ortiz', role: 'Sales Manager', init: 'SO', color: '#c95470' },
    { id: 'u6', name: 'Priya Nair', role: 'Pricing Analyst', init: 'PN', color: '#c9a23a' },
    { id: 'u7', name: 'Gus Pelletier', role: 'Inventory Manager', init: 'GP', color: '#6a7782' },
    { id: 'u8', name: 'Hector Ruiz', role: 'Service Technician', init: 'HR', color: '#c97b3a' },
    { id: 'u9', name: 'Lori Kemp', role: 'Office / Titles', init: 'LK', color: '#3ac9a0' },
    { id: 'u10', name: 'Ada Fenwick', role: 'Bookkeeper', init: 'AF', color: '#5b7c99' },
    { id: 'u11', name: 'Boone Carter', role: 'Delivery Dispatch', init: 'BC', color: '#9a7a55' },
  ];
  const byId = id => users.find(u => u.id === id) || { name: '—', init: '?', color: '#888' };

  // --- inventory (status threads through every view) ---
  // status: incoming | recon | available | pending | sold
  const inventory = [
    { stock: 'TV-2901', type: 'Dry Van', year: 2019, make: 'Wabash', len: '53 ft', cost: 13800, list: 18500, floor: 16400, status: 'available', loc: 'Main Yard', acq: D(58), cond: 'Used', views: 412, leads: 5 },
    { stock: 'FB-4410', type: 'Flatbed', year: 2021, make: 'Great Dane', len: '48 ft', cost: 21200, list: 27900, floor: 25000, status: 'available', loc: 'Main Yard', acq: D(31), cond: 'Used', views: 690, leads: 8 },
    { stock: 'RF-7220', type: 'Reefer', year: 2017, make: 'Utility', len: '53 ft', cost: 25500, list: 32000, floor: 29500, status: 'pending', loc: 'North Lot', acq: D(72), cond: 'Used', views: 533, leads: 6 },
    { stock: 'SD-1188', type: 'Step Deck', year: 2020, make: 'Fontaine', len: '48 ft', cost: 23900, list: 29500, floor: 27200, status: 'available', loc: 'Main Yard', acq: D(20), cond: 'Used', views: 288, leads: 3 },
    { stock: 'LB-3050', type: 'Lowboy / RGN', year: 2015, make: 'Manac', len: '53 ft', cost: 33500, list: 41000, floor: 38000, status: 'available', loc: 'North Lot', acq: D(96), cond: 'Used', views: 451, leads: 4, aged: 1 },
    { stock: 'DT-6602', type: 'Dump', year: 2022, make: 'PJ', len: '40 ft', cost: 18900, list: 22750, floor: 21000, status: 'recon', loc: 'Service Bay', acq: D(8), cond: 'Refurb', views: 0, leads: 0 },
    { stock: 'ED-8801', type: 'Dump', year: 2018, make: 'MAC', len: '40 ft', cost: 30100, list: 36400, floor: 33000, status: 'sold', loc: '—', acq: D(120), sold: D(3), cond: 'Used', views: 712, leads: 9 },
    { stock: 'TK-9920', type: 'Tanker', year: 2023, make: 'Polar', len: '42 ft', cost: 52000, list: 58900, floor: 56000, status: 'available', loc: 'Main Yard', acq: D(14), cond: 'New', views: 377, leads: 7 },
    { stock: 'DD-2277', type: 'Drop Deck', year: 2016, make: 'Doonan', len: '48 ft', cost: 15100, list: 19200, floor: 17500, status: 'available', loc: 'Main Yard', acq: D(112), cond: 'Used', views: 240, leads: 2, aged: 1 },
    { stock: 'EQ-5140', type: 'Equipment', year: 2019, make: 'Big Tex', len: '35 ft', cost: 11200, list: 14800, floor: 13500, status: 'available', loc: 'North Lot', acq: D(26), cond: 'Used', views: 305, leads: 4 },
    { stock: 'LV-3360', type: 'Livestock', year: 2021, make: 'Wilson', len: '50 ft', cost: 26800, list: 31200, floor: 29000, status: 'pending', loc: 'Main Yard', acq: D(40), cond: 'Used', views: 198, leads: 3 },
    { stock: 'CH-1009', type: 'Chassis', year: 2014, make: 'Hyundai', len: '53 ft', cost: 8900, list: 11900, floor: 10500, status: 'available', loc: 'North Lot', acq: D(63), cond: 'Used', views: 142, leads: 1 },
    { stock: 'IN-5521', type: 'Reefer', year: 2020, make: 'Great Dane', len: '53 ft', cost: 34000, list: 0, floor: 0, status: 'incoming', loc: 'In transit', acq: D(1), cond: 'Used', views: 0, leads: 0, eta: 4 },
    { stock: 'IN-5522', type: 'Flatbed', year: 2022, make: 'Reitnouer', len: '48 ft', cost: 29500, list: 0, floor: 0, status: 'incoming', loc: 'In transit', acq: D(2), cond: 'Used', views: 0, leads: 0, eta: 6 },
  ];
  const inv = s => inventory.find(t => t.stock === s);

  // --- leads (lead-gen + sales) ---
  const leads = [
    { id: 'L-3001', name: 'Cody Marsh', co: 'Marsh Hauling', src: 'Web form', interest: 'FB-4410', status: 'new', owner: 'u2', created: D(0), value: 27900, phone: '417-555-0142' },
    { id: 'L-3002', name: 'Diane Pruitt', co: 'Pruitt Logistics', src: 'TruckPaper', interest: 'RF-7220', status: 'quoted', owner: 'u3', created: D(2), value: 32000, phone: '309-555-0188' },
    { id: 'L-3003', name: 'Owen Stiles', co: 'Stiles & Sons', src: 'Phone', interest: 'LB-3050', status: 'working', owner: 'u3', created: D(4), value: 41000, phone: '618-555-0173' },
    { id: 'L-3004', name: 'Renee Holt', co: 'Holt Ag', src: 'Facebook', interest: 'LV-3360', status: 'working', owner: 'u4', created: D(3), value: 31200, phone: '217-555-0110' },
    { id: 'L-3005', name: 'Marcus Bell', co: 'Bell Freight', src: 'Web form', interest: 'TK-9920', status: 'new', owner: 'u2', created: D(0), value: 58900, phone: '314-555-0166' },
    { id: 'L-3006', name: 'Ivy Chen', co: 'Lakeside Intermodal', src: 'Referral', interest: 'CH-1009', status: 'quoted', owner: 'u4', created: D(6), value: 11900, phone: '312-555-0124' },
    { id: 'L-3007', name: 'Travis Munoz', co: 'TM Excavating', src: 'Google Ads', interest: 'EQ-5140', status: 'won', owner: 'u3', created: D(9), value: 14800, phone: '563-555-0199' },
    { id: 'L-3008', name: 'Sheila Park', co: 'Park Produce', src: 'Web form', interest: 'IN-5521', status: 'new', owner: 'u2', created: D(0), value: 39500, phone: '515-555-0155' },
    { id: 'L-3009', name: 'Hank Doyle', co: 'Doyle Bros', src: 'Walk-in', interest: 'SD-1188', status: 'lost', owner: 'u4', created: D(12), value: 29500, phone: '217-555-0102', lostReason: 'Bought elsewhere' },
    { id: 'L-3010', name: 'Gabe Foster', co: 'Foster Sand & Gravel', src: 'TruckPaper', interest: 'ED-8801', status: 'won', owner: 'u3', created: D(11), value: 36400, phone: '660-555-0177' },
  ];

  // --- pipeline / deals ---
  // stage: lead | quoted | negotiation | financing | delivery | won | lost
  const deals = [
    { id: 'D-901', cust: 'Stiles & Sons', stock: 'LB-3050', stage: 'negotiation', value: 39800, sales: 'u3', updated: D(1), prob: 60 },
    { id: 'D-902', cust: 'Pruitt Logistics', stock: 'RF-7220', stage: 'financing', value: 31500, sales: 'u3', updated: D(0), prob: 80 },
    { id: 'D-903', cust: 'Holt Ag', stock: 'LV-3360', stage: 'quoted', value: 31200, sales: 'u4', updated: D(2), prob: 40 },
    { id: 'D-904', cust: 'Bell Freight', stock: 'TK-9920', stage: 'quoted', value: 58900, sales: 'u4', updated: D(1), prob: 35 },
    { id: 'D-905', cust: 'TM Excavating', stock: 'EQ-5140', stage: 'won', value: 14800, sales: 'u3', updated: D(2), prob: 100 },
    { id: 'D-906', cust: 'Foster Sand & Gravel', stock: 'ED-8801', stage: 'delivery', value: 36400, sales: 'u3', updated: D(3), prob: 100 },
    { id: 'D-907', cust: 'Lakeside Intermodal', stock: 'CH-1009', stage: 'negotiation', value: 11500, sales: 'u4', updated: D(1), prob: 55 },
    { id: 'D-908', cust: 'Marsh Hauling', stock: 'FB-4410', stage: 'lead', value: 27900, sales: 'u3', updated: D(0), prob: 20 },
  ];

  // --- work orders (service / maintenance) ---
  // status: open | in-progress | waiting-parts | done
  const workOrders = [
    { id: 'WO-7001', stock: 'DT-6602', type: 'Recon', status: 'in-progress', tech: 'u8', opened: D(8), hrs: 6.5, est: 9, tasks: [['Replace hoist cylinder', 1], ['New tarp system', 1], ['Repaint box', 0], ['DOT lights/brakes', 0]], parts: 1840 },
    { id: 'WO-7002', stock: 'IN-5521', type: 'Intake inspection', status: 'open', tech: 'u8', opened: D(1), hrs: 0, est: 3, tasks: [['Brake measurement', 0], ['Tire tread/DOT', 0], ['Reefer hours/PM', 0], ['Floor & walls', 0]], parts: 0 },
    { id: 'WO-7003', stock: 'RF-7220', type: 'Pre-delivery PM', status: 'waiting-parts', tech: 'u8', opened: D(2), hrs: 2, est: 4, tasks: [['Service reefer unit', 1], ['Replace 2 tires', 0], ['Door seals', 1]], parts: 720 },
    { id: 'WO-7004', stock: 'LB-3050', type: 'Repair', status: 'done', tech: 'u8', opened: D(5), hrs: 3, est: 3, tasks: [['Rewire trailer harness', 1], ['Air leak — gladhand', 1]], parts: 240 },
  ];

  // --- accounting: invoices + payments ---
  // status: paid | due | overdue
  const invoices = [
    { id: 'INV-4501', cust: 'TM Excavating', stock: 'EQ-5140', amount: 14800, status: 'paid', date: D(2), method: 'Wire' },
    { id: 'INV-4502', cust: 'Foster Sand & Gravel', stock: 'ED-8801', amount: 36400, status: 'due', date: D(3), due: D(-4) },
    { id: 'INV-4503', cust: 'Pruitt Logistics', stock: 'RF-7220', amount: 6300, status: 'due', date: D(0), due: D(-9), note: 'Deposit' },
    { id: 'INV-4504', cust: 'Cornerstone Repairs', stock: '', amount: 1840, status: 'overdue', date: D(22), due: D(8), note: 'AP · recon parts' },
    { id: 'INV-4505', cust: 'Roadway Transport', stock: 'ED-8801', amount: 1250, status: 'due', date: D(1), due: D(-6), note: 'Delivery freight' },
  ];

  // --- platform side (super-admin: other dealerships TPOS hosts) ---
  const tenants = [
    { id: 't1', name: 'Ironline Trailer Co.', plan: 'Growth', mrr: 499, seats: 11, units: 14, since: D(420), status: 'active', city: 'Springfield, IL' },
    { id: 't2', name: 'Bayou Trailer Sales', plan: 'Starter', mrr: 199, seats: 4, units: 22, since: D(180), status: 'active', city: 'Lafayette, LA' },
    { id: 't3', name: 'High Plains Trailers', plan: 'Growth', mrr: 499, seats: 9, units: 61, since: D(95), status: 'active', city: 'Amarillo, TX' },
    { id: 't4', name: 'Cascade Equipment', plan: 'Enterprise', mrr: 1290, seats: 26, units: 140, since: D(610), status: 'active', city: 'Salem, OR' },
    { id: 't5', name: 'Keystone Hauling Supply', plan: 'Starter', mrr: 199, seats: 3, units: 12, since: D(12), status: 'trial', city: 'Harrisburg, PA' },
    { id: 't6', name: 'Delta Trailer Outlet', plan: 'License (self-host)', mrr: 0, seats: 18, units: 88, since: D(300), status: 'licensed', city: 'Memphis, TN' },
  ];

  // --- derived KPIs (so dashboards agree) ---
  const avail = inventory.filter(t => t.status === 'available');
  const kpi = {
    unitsInStock: inventory.filter(t => t.status !== 'sold').length,
    available: avail.length,
    pipelineValue: deals.filter(d => !['won', 'lost'].includes(d.stage)).reduce((s, d) => s + d.value, 0),
    invValue: avail.reduce((s, t) => s + t.list, 0),
    invCost: inventory.filter(t => t.status !== 'sold').reduce((s, t) => s + t.cost, 0),
    soldMTD: 7, revenueMTD: 214500, grossMTD: 38900,
    newLeads: leads.filter(l => l.status === 'new').length,
    openWO: workOrders.filter(w => w.status !== 'done').length,
    arDue: invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0),
    mrr: tenants.reduce((s, t) => s + t.mrr, 0),
    avgDaysOnLot: 41, avgMargin: 22.4,
  };

  return { money, k, ago, D, tenant, users, byId, inventory, inv, leads, deals, workOrders, invoices, tenants, kpi };
})();
