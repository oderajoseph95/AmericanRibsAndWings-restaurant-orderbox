// Barangay data with center coordinates for delivery calculations
// Coordinates are approximate center points for each barangay

export interface Barangay {
  name: string;
  lat: number;
  lng: number;
}

export const BARANGAYS: Record<string, Barangay[]> = {
  Floridablanca: [
    { name: "Anon", lat: 14.9821, lng: 120.5190 },
    { name: "Apalit", lat: 14.9756, lng: 120.5124 },
    { name: "Basa Air Base", lat: 14.9884, lng: 120.4936 },
    { name: "Benedicto", lat: 14.9632, lng: 120.5287 },
    { name: "Bodega", lat: 14.9701, lng: 120.5234 },
    { name: "Cabangcalan", lat: 14.9589, lng: 120.5312 },
    { name: "Calantas", lat: 14.9567, lng: 120.5189 },
    { name: "Carmencita", lat: 14.9645, lng: 120.5398 },
    { name: "Consuelo", lat: 14.9712, lng: 120.5456 },
    { name: "Dampe", lat: 14.9534, lng: 120.5267 },
    { name: "Del Carmen", lat: 14.9678, lng: 120.5321 },
    { name: "Fortuna", lat: 14.9789, lng: 120.5287 },
    { name: "Gutad", lat: 14.9856, lng: 120.5234 },
    { name: "Mabical", lat: 14.9612, lng: 120.5134 },
    { name: "Maligaya", lat: 14.9534, lng: 120.5089 },
    { name: "Mawacat", lat: 14.9923, lng: 120.5123 },
    { name: "Nabuclod", lat: 14.9478, lng: 120.5267 },
    { name: "Pabanlag", lat: 14.9801, lng: 120.5189 },
    { name: "Paguiruan", lat: 14.9723, lng: 120.5089 },
    { name: "Palmayo", lat: 14.9645, lng: 120.5034 },
    { name: "Pandaguirig", lat: 14.9567, lng: 120.4989 },
    { name: "Poblacion", lat: 14.9734, lng: 120.5312 },
    { name: "San Antonio", lat: 14.9689, lng: 120.5234 },
    { name: "San Isidro", lat: 14.9612, lng: 120.5398 },
    { name: "San Jose", lat: 14.9756, lng: 120.5456 },
    { name: "San Nicolas", lat: 14.9834, lng: 120.5398 },
    { name: "San Pedro", lat: 14.9789, lng: 120.5512 },
    { name: "San Ramon", lat: 14.9712, lng: 120.5567 },
    { name: "San Roque", lat: 14.9645, lng: 120.5512 },
    { name: "Santa Monica", lat: 14.9567, lng: 120.5456 },
    { name: "Santo Rosario", lat: 14.9489, lng: 120.5398 },
    { name: "Solib", lat: 14.9747, lng: 120.5373 }, // Restaurant is here
    { name: "Valdez", lat: 14.9423, lng: 120.5312 },
  ],
  Guagua: [
    { name: "Ascomo", lat: 14.9667, lng: 120.6334 },
    { name: "Bancal", lat: 14.9712, lng: 120.6289 },
    { name: "Jose Abad Santos", lat: 14.9589, lng: 120.6234 },
    { name: "Lambac", lat: 14.9534, lng: 120.6189 },
    { name: "Magsaysay", lat: 14.9478, lng: 120.6134 },
    { name: "Maquiapo", lat: 14.9645, lng: 120.6089 },
    { name: "Natividad", lat: 14.9701, lng: 120.6034 },
    { name: "Plaza Burgos", lat: 14.9623, lng: 120.6312 },
    { name: "Pulungmasle", lat: 14.9567, lng: 120.6367 },
    { name: "Rizal", lat: 14.9734, lng: 120.6423 },
    { name: "San Agustin", lat: 14.9789, lng: 120.6234 },
    { name: "San Antonio", lat: 14.9834, lng: 120.6189 },
    { name: "San Isidro", lat: 14.9878, lng: 120.6134 },
    { name: "San Jose", lat: 14.9501, lng: 120.6089 },
    { name: "San Juan", lat: 14.9445, lng: 120.6134 },
    { name: "San Juan Bautista", lat: 14.9389, lng: 120.6189 },
    { name: "San Juan Nepomuceno", lat: 14.9756, lng: 120.6367 },
    { name: "San Matias", lat: 14.9812, lng: 120.6312 },
    { name: "San Miguel", lat: 14.9856, lng: 120.6267 },
    { name: "San Nicolas 1st", lat: 14.9423, lng: 120.6234 },
    { name: "San Nicolas 2nd", lat: 14.9367, lng: 120.6289 },
    { name: "San Pablo", lat: 14.9489, lng: 120.6423 },
    { name: "San Pedro", lat: 14.9534, lng: 120.6478 },
    { name: "San Rafael", lat: 14.9578, lng: 120.6523 },
    { name: "San Roque", lat: 14.9623, lng: 120.6478 },
    { name: "San Vicente", lat: 14.9667, lng: 120.6534 },
    { name: "Santa Filomena", lat: 14.9712, lng: 120.6478 },
    { name: "Santa Ines", lat: 14.9756, lng: 120.6534 },
    { name: "Santa Ursula", lat: 14.9801, lng: 120.6478 },
    { name: "Santo Cristo", lat: 14.9845, lng: 120.6423 },
    { name: "Santo Niño", lat: 14.9889, lng: 120.6367 },
  ],
  Lubao: [
    { name: "Balantacan", lat: 14.9445, lng: 120.5989 },
    { name: "Bancal Pugad", lat: 14.9389, lng: 120.5934 },
    { name: "Bancal Sinubli", lat: 14.9334, lng: 120.5878 },
    { name: "Baruya", lat: 14.9278, lng: 120.5823 },
    { name: "Calangain", lat: 14.9223, lng: 120.5767 },
    { name: "Concepcion", lat: 14.9345, lng: 120.5978 },
    { name: "De La Paz", lat: 14.9501, lng: 120.6034 },
    { name: "Del Carmen", lat: 14.9556, lng: 120.5989 },
    { name: "Don Ignacio Dimson", lat: 14.9612, lng: 120.5934 },
    { name: "Lourdes", lat: 14.9167, lng: 120.5712 },
    { name: "Prado Siongco", lat: 14.9112, lng: 120.5656 },
    { name: "Remedios", lat: 14.9056, lng: 120.5601 },
    { name: "San Agustin", lat: 14.9667, lng: 120.5878 },
    { name: "San Antonio", lat: 14.9723, lng: 120.5823 },
    { name: "San Francisco", lat: 14.9001, lng: 120.5545 },
    { name: "San Isidro", lat: 14.8945, lng: 120.5489 },
    { name: "San Jose Apunan", lat: 14.9778, lng: 120.5767 },
    { name: "San Jose Gumi", lat: 14.9834, lng: 120.5712 },
    { name: "San Juan", lat: 14.8889, lng: 120.5434 },
    { name: "San Matias", lat: 14.8834, lng: 120.5378 },
    { name: "San Miguel", lat: 14.9889, lng: 120.5656 },
    { name: "San Nicolas 1st", lat: 14.8778, lng: 120.5323 },
    { name: "San Nicolas 2nd", lat: 14.8723, lng: 120.5267 },
    { name: "San Pablo 1st", lat: 14.9945, lng: 120.5601 },
    { name: "San Pablo 2nd", lat: 15.0001, lng: 120.5545 },
    { name: "San Pedro Palcarangan", lat: 14.8667, lng: 120.5212 },
    { name: "San Pedro Saug", lat: 14.8612, lng: 120.5156 },
    { name: "San Roque Arbol", lat: 15.0056, lng: 120.5489 },
    { name: "San Roque Dau", lat: 15.0112, lng: 120.5434 },
    { name: "San Vicente", lat: 14.8556, lng: 120.5101 },
    { name: "Santa Barbara", lat: 15.0167, lng: 120.5378 },
    { name: "Santa Catalina", lat: 15.0223, lng: 120.5323 },
    { name: "Santa Cruz", lat: 14.8501, lng: 120.5045 },
    { name: "Santa Lucia", lat: 15.0278, lng: 120.5267 },
    { name: "Santa Maria", lat: 15.0334, lng: 120.5212 },
    { name: "Santa Monica", lat: 14.8445, lng: 120.4989 },
    { name: "Santa Rita", lat: 15.0389, lng: 120.5156 },
    { name: "Santa Teresa 1st", lat: 14.8389, lng: 120.4934 },
    { name: "Santa Teresa 2nd", lat: 14.8334, lng: 120.4878 },
    { name: "Santiago", lat: 15.0445, lng: 120.5101 },
    { name: "Santo Cristo", lat: 15.0501, lng: 120.5045 },
    { name: "Santo Domingo", lat: 14.8278, lng: 120.4823 },
    { name: "Santo Niño", lat: 15.0556, lng: 120.4989 },
    { name: "Santo Tomas", lat: 15.0612, lng: 120.4934 },
  ],
  Porac: [
    { name: "Babo Pangulo", lat: 15.0712, lng: 120.5423 },
    { name: "Babo Sacan", lat: 15.0778, lng: 120.5367 },
    { name: "Balubad", lat: 15.0834, lng: 120.5312 },
    { name: "Calzadang Bayu", lat: 15.0889, lng: 120.5256 },
    { name: "Camias", lat: 15.0945, lng: 120.5201 },
    { name: "Cangatba", lat: 15.0656, lng: 120.5478 },
    { name: "Diaz", lat: 15.0601, lng: 120.5534 },
    { name: "Dolores", lat: 15.0545, lng: 120.5589 },
    { name: "Inararo", lat: 15.0489, lng: 120.5645 },
    { name: "Jalung", lat: 15.0434, lng: 120.5701 },
    { name: "Mancatian", lat: 15.0378, lng: 120.5756 },
    { name: "Manibaug Libutad", lat: 15.0323, lng: 120.5812 },
    { name: "Manibaug Paralaya", lat: 15.0267, lng: 120.5867 },
    { name: "Manibaug Pasig", lat: 15.0212, lng: 120.5923 },
    { name: "Manuali", lat: 15.0156, lng: 120.5978 },
    { name: "Mitla Proper", lat: 15.0101, lng: 120.6034 },
    { name: "Palat", lat: 15.0045, lng: 120.6089 },
    { name: "Pias", lat: 14.9989, lng: 120.6145 },
    { name: "Pio", lat: 14.9934, lng: 120.6201 },
    { name: "Planas", lat: 15.1001, lng: 120.5145 },
    { name: "Poblacion", lat: 15.0734, lng: 120.5434 },
    { name: "Pulong Santol", lat: 15.1056, lng: 120.5089 },
    { name: "Salu", lat: 15.1112, lng: 120.5034 },
    { name: "San Jose Mitla", lat: 14.9878, lng: 120.6256 },
    { name: "Santa Cruz", lat: 15.1167, lng: 120.4978 },
    { name: "Sapang Uwak", lat: 15.1223, lng: 120.4923 },
    { name: "Sepung Bulaun", lat: 15.1278, lng: 120.4867 },
    { name: "Sinura", lat: 15.1334, lng: 120.4812 },
    { name: "Villa Maria", lat: 15.1389, lng: 120.4756 },
  ],
};

// Get barangays for a specific city
export const getBarangaysByCity = (city: string): Barangay[] => {
  return BARANGAYS[city] || [];
};

// Get barangay names only for a specific city
export const getBarangayNamesByCity = (city: string): string[] => {
  return (BARANGAYS[city] || []).map(b => b.name);
};

// Find barangay by name in a city
export const findBarangay = (city: string, barangayName: string): Barangay | undefined => {
  return (BARANGAYS[city] || []).find(b => b.name === barangayName);
};

// List of allowed cities
export const ALLOWED_CITIES = Object.keys(BARANGAYS);
