// Presentation groups only. Existing station keys, saved data and permissions stay unchanged.
const group=(station,title,fields)=>({station,title,fields:fields.split(' ')});
export const GUEST_SECTIONS=[
 {number:1,title:'Guest Information',groups:[group('registration','', 'name local occupation age sex phone country province village language notes')]},
 {number:2,title:'Medical History',groups:[
  group('intake','A. Existing health conditions','health_conditions other_conditions surgery_history medications allergies'),
  group('intake','B. Family History','family_history')]},
 {number:3,title:'Current Symptoms and Health Concerns',groups:[group('intake','','current_symptoms symptoms')]},
 {number:4,title:'Lifestyle Assessment',groups:[group('intake','','eating_pattern eating_other fruit_vegetables physical_activity sleep water stress tobacco alcohol notes')]},
 {number:5,title:'Physical Measurements and Vital Signs',groups:[
  group('measurements','Anthropometric measurements','height weight waist bmi notes'),
  group('assessment','Vital signs','systolic diastolic pulse temperature respiratory spo2')]},
 {number:6,title:'Blood Screening',groups:[
  group('assessment','Blood glucose','sugar sugarUnit sugarContext hours_since_meal test_time known_diabetes diabetes_medicine diabetes_medicine_type sugar_notes'),
  group('assessment','Total cholesterol','cholesterol cholesterolUnit high_cholesterol cholesterol_medicine cholesterol_medicine_type cholesterol_notes'),
  group('assessment','Uric acid','uric uricUnit gout_stones uric_symptoms'),
  group('assessment','Additional screening notes','notes referral followup_date'),
  group('assessment','Earlier assessment details','conditions symptoms allergies medications diagnoses')]},
 {number:7,title:'Urinalysis Dipstick Screening',groups:[group('urinalysis','','strip_brand tested_at leukocytes nitrite urobilinogen protein ph specific_gravity ketones blood bilirubin glucose ascorbic_acid notes')]},
 {number:8,title:'Eyeglasses',groups:[group('glasses','','status grade quantity remarks notes')]},
 {number:9,title:'Dental Cleaning',groups:[group('dental','','assessment status remarks notes')]},
 {number:10,title:'Consultation',groups:[group('consultation','','reason findings notes advice referral clinician followup_date diagnoses')]},
 {number:null,title:'Wellness Activities',groups:[group('programs','','education juicing detox other other_status notes')]}
];
export const GUEST_FIELD_LABELS={
 name:'Full name',occupation:'Occupation',bmi:'BMI',family_history:'Family history',
 other_conditions:'Other chronic illnesses — details',surgery_history:'Previous surgery or hospitalization — details and approximate date',
 medications:'Current medications, vitamins and supplements',allergies:'Known allergies and reactions',
 symptoms:'Other concerns, onset, duration and severity',eating_pattern:'Usual eating pattern',eating_other:'Other eating pattern',
 fruit_vegetables:'Fruit and vegetable intake',physical_activity:'Physical activity',sleep:'Sleep per night',water:'Water intake',stress:'Stress level',tobacco:'Smoking or tobacco use',alcohol:'Alcohol use',
 sugar:'Blood glucose result',sugarUnit:'Blood glucose unit',sugarContext:'Testing condition',hours_since_meal:'Time since last meal (hours)',test_time:'Glucose test time',
 known_diabetes:'Known diabetes',diabetes_medicine:'Taking diabetes medicine',diabetes_medicine_type:'Diabetes medicine type',sugar_notes:'Glucose notes, symptoms or follow-up',
 cholesterol:'Total cholesterol result',high_cholesterol:'Previous high cholesterol',cholesterol_medicine:'Taking cholesterol medicine',cholesterol_medicine_type:'Cholesterol medicine type',cholesterol_notes:'Cholesterol notes, symptoms or follow-up',
 uric:'Uric acid result',gout_stones:'Previous gout or kidney stones',uric_symptoms:'Current joint pain/swelling or other relevant symptoms',
 specific_gravity:'Specific gravity',ascorbic_acid:'Ascorbic acid',reason:'Reasons',assessment:'Dental assessment',quantity:'Pairs dispensed'
};
