import { db } from './index.js';
import { regions, cities } from './schema/index.js';

const REGIONS = [
  { nameEn: 'Tbilisi', nameKa: 'თბილისი', code: 'TB' },
  { nameEn: 'Adjara', nameKa: 'აჭარა', code: 'AJ' },
  { nameEn: 'Guria', nameKa: 'გურია', code: 'GU' },
  { nameEn: 'Imereti', nameKa: 'იმერეთი', code: 'IM' },
  { nameEn: 'Kakheti', nameKa: 'კახეთი', code: 'KA' },
  { nameEn: 'Kvemo Kartli', nameKa: 'ქვემო ქართლი', code: 'KK' },
  { nameEn: 'Mtskheta-Mtianeti', nameKa: 'მცხეთა-მთიანეთი', code: 'MM' },
  { nameEn: 'Racha-Lechkhumi and Kvemo Svaneti', nameKa: 'რაჭა-ლეჩხუმი და ქვემო სვანეთი', code: 'RL' },
  { nameEn: 'Samegrelo-Zemo Svaneti', nameKa: 'სამეგრელო-ზემო სვანეთი', code: 'SZ' },
  { nameEn: 'Samtskhe-Javakheti', nameKa: 'სამცხე-ჯავახეთი', code: 'SJ' },
  { nameEn: 'Shida Kartli', nameKa: 'შიდა ქართლი', code: 'SK' },
];

const CITIES_BY_REGION: Record<string, Array<{ nameEn: string; nameKa: string }>> = {
  TB: [
    { nameEn: 'Tbilisi', nameKa: 'თბილისი' },
  ],
  AJ: [
    { nameEn: 'Batumi', nameKa: 'ბათუმი' },
    { nameEn: 'Kobuleti', nameKa: 'ქობულეთი' },
    { nameEn: 'Khelvachauri', nameKa: 'ხელვაჩაური' },
  ],
  GU: [
    { nameEn: 'Ozurgeti', nameKa: 'ოზურგეთი' },
    { nameEn: 'Lanchkhuti', nameKa: 'ლანჩხუთი' },
  ],
  IM: [
    { nameEn: 'Kutaisi', nameKa: 'ქუთაისი' },
    { nameEn: 'Zestaponi', nameKa: 'ზესტაფონი' },
    { nameEn: 'Samtredia', nameKa: 'სამტრედია' },
    { nameEn: 'Chiatura', nameKa: 'ჭიათურა' },
    { nameEn: 'Tkibuli', nameKa: 'ტყიბული' },
    { nameEn: 'Sachkhere', nameKa: 'საჩხერე' },
  ],
  KA: [
    { nameEn: 'Telavi', nameKa: 'თელავი' },
    { nameEn: 'Sighnaghi', nameKa: 'სიღნაღი' },
    { nameEn: 'Gurjaani', nameKa: 'გურჯაანი' },
    { nameEn: 'Kvareli', nameKa: 'ყვარელი' },
    { nameEn: 'Lagodekhi', nameKa: 'ლაგოდეხი' },
    { nameEn: 'Sagarejo', nameKa: 'საგარეჯო' },
  ],
  KK: [
    { nameEn: 'Rustavi', nameKa: 'რუსთავი' },
    { nameEn: 'Gardabani', nameKa: 'გარდაბანი' },
    { nameEn: 'Marneuli', nameKa: 'მარნეული' },
    { nameEn: 'Bolnisi', nameKa: 'ბოლნისი' },
    { nameEn: 'Tsalka', nameKa: 'წალკა' },
  ],
  MM: [
    { nameEn: 'Mtskheta', nameKa: 'მცხეთა' },
    { nameEn: 'Dusheti', nameKa: 'დუშეთი' },
    { nameEn: 'Tianeti', nameKa: 'თიანეთი' },
    { nameEn: 'Kazbegi', nameKa: 'ყაზბეგი' },
  ],
  RL: [
    { nameEn: 'Ambrolauri', nameKa: 'ამბროლაური' },
    { nameEn: 'Oni', nameKa: 'ონი' },
    { nameEn: 'Tsageri', nameKa: 'ცაგერი' },
    { nameEn: 'Lentekhi', nameKa: 'ლენტეხი' },
  ],
  SZ: [
    { nameEn: 'Zugdidi', nameKa: 'ზუგდიდი' },
    { nameEn: 'Poti', nameKa: 'ფოთი' },
    { nameEn: 'Senaki', nameKa: 'სენაკი' },
    { nameEn: 'Mestia', nameKa: 'მესტია' },
    { nameEn: 'Khobi', nameKa: 'ხობი' },
  ],
  SJ: [
    { nameEn: 'Akhaltsikhe', nameKa: 'ახალციხე' },
    { nameEn: 'Borjomi', nameKa: 'ბორჯომი' },
    { nameEn: 'Akhalkalaki', nameKa: 'ახალქალაქი' },
    { nameEn: 'Ninotsminda', nameKa: 'ნინოწმინდა' },
  ],
  SK: [
    { nameEn: 'Gori', nameKa: 'გორი' },
    { nameEn: 'Kaspi', nameKa: 'კასპი' },
    { nameEn: 'Khashuri', nameKa: 'ხაშური' },
    { nameEn: 'Kareli', nameKa: 'ქარელი' },
  ],
};

async function seed() {
  console.log('Seeding regions and cities...');

  // Insert regions
  const insertedRegions = await db
    .insert(regions)
    .values(REGIONS)
    .onConflictDoNothing({ target: regions.code })
    .returning();

  console.log(`Inserted ${insertedRegions.length} regions`);

  // Build region code → id map
  const regionMap = new Map<string, number>();
  for (const r of insertedRegions) {
    regionMap.set(r.code, r.id);
  }

  // Insert cities
  let cityCount = 0;
  for (const [regionCode, regionCities] of Object.entries(CITIES_BY_REGION)) {
    const regionId = regionMap.get(regionCode);
    if (!regionId) continue;

    const values = regionCities.map((c) => ({
      regionId,
      nameEn: c.nameEn,
      nameKa: c.nameKa,
    }));

    const inserted = await db
      .insert(cities)
      .values(values)
      .onConflictDoNothing()
      .returning();

    cityCount += inserted.length;
  }

  console.log(`Inserted ${cityCount} cities`);
  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
