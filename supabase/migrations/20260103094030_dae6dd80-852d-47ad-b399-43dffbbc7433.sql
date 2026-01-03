-- Add flavor_category to differentiate wings, fries, drinks
ALTER TABLE public.flavors ADD COLUMN flavor_category text DEFAULT 'wings';

-- Update existing flavors to have wings category
UPDATE public.flavors SET flavor_category = 'wings' WHERE flavor_category IS NULL OR flavor_category = 'wings';

-- Insert Fries flavors
INSERT INTO public.flavors (name, flavor_type, surcharge, is_active, sort_order, flavor_category) VALUES
('Smoked BBQ', 'all_time', 0, true, 101, 'fries'),
('Cheddar Explosion', 'all_time', 0, true, 102, 'fries'),
('Pizza Indulgence', 'all_time', 0, true, 103, 'fries'),
('Savory Truffle', 'all_time', 0, true, 104, 'fries');

-- Insert Drink flavors
INSERT INTO public.flavors (name, flavor_type, surcharge, is_active, sort_order, flavor_category) VALUES
('Iced Tea', 'all_time', 0, true, 201, 'drinks'),
('Blue Lemonade', 'all_time', 0, true, 202, 'drinks'),
('Red Iced Tea', 'all_time', 0, true, 203, 'drinks');