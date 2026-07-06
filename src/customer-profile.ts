export interface CustomerProfile {
  name: string;
  location: 'California' | 'Texas' | 'New York';
  tier: 'Bronze' | 'Silver' | 'Gold';
  purchasedItem: string;
  itemCategory: 'clothing' | 'electronics' | 'other';
  purchaseDate: string; // e.g. "2026-06-20"
  currentDate: string; // e.g. "2026-07-03" (local time)
  daysSinceDelivery: number;
  itemIssue: 'damaged/defective' | 'change of mind';
  enrolledInPartnerProgram: boolean;
}

export function generateRandomProfile(): CustomerProfile {
  const items = [
    { name: 'Leather Jacket', category: 'clothing' },
    { name: 'Smart Watch', category: 'electronics' },
    { name: 'Coffee Mug', category: 'other' },
  ];
  const selectedItem = items[Math.floor(Math.random() * items.length)];
  const days = Math.floor(Math.random() * 40); // 0 to 40 days ago

  const currentDateObj = new Date();
  const purchaseDateObj = new Date();
  purchaseDateObj.setDate(currentDateObj.getDate() - days);

  return {
    name: 'Alex Rivera',
    location: ['California', 'Texas', 'New York'][
      Math.floor(Math.random() * 3)
    ] as any,
    tier: ['Bronze', 'Silver', 'Gold'][Math.floor(Math.random() * 3)] as any,
    purchasedItem: selectedItem.name,
    itemCategory: selectedItem.category as any,
    purchaseDate: purchaseDateObj.toISOString().split('T')[0],
    currentDate: currentDateObj.toISOString().split('T')[0],
    daysSinceDelivery: days,
    itemIssue: Math.random() > 0.5 ? 'damaged/defective' : 'change of mind',
    enrolledInPartnerProgram: Math.random() > 0.5,
  };
}
