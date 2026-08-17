export interface Sucursal {
  id: string;
  name: string;
  address: string;
  /** Texto de búsqueda usado para ubicar la sucursal en Google Maps */
  mapsQuery: string;
  phone?: string;
  /**
   * Coordenadas del local; son el origen de la ruta de reparto, por lo que
   * deben coincidir con el pin que muestra /sucursales (Google resuelve el
   * mapsQuery a este punto). Si cambia una dirección, actualizar ambos.
   */
  lat: number;
  lng: number;
}

export const sucursales: Sucursal[] = [
  {
    id: "junin",
    name: "Casa Central · Junín",
    address: "Junín 2198, Corrientes",
    mapsQuery: "Junín 2198, Corrientes, Argentina",
    phone: "3794 525617",
    lat: -27.4689014,
    lng: -58.8228427,
  },
  {
    id: "sarmiento",
    name: "Sarmiento y La Pampa",
    address: "Sarmiento y La Pampa, Corrientes",
    mapsQuery: "Sarmiento y La Pampa, Corrientes, Argentina",
    phone: "3794 525617",
    lat: -27.486098,
    lng: -58.831291,
  },
  {
    id: "cazadores",
    name: "Av. Cazadores Correntinos",
    address: "Av. Cazadores Correntinos 3038, Corrientes",
    mapsQuery: "Av. Cazadores Correntinos 3038, Corrientes, Argentina",
    lat: -27.4871312,
    lng: -58.815603,
  },
  {
    id: "independencia-5328",
    name: "Av. Independencia 5328",
    address: "Av. Independencia 5328, Corrientes",
    mapsQuery: "Av. Independencia 5328, Corrientes, Argentina",
    lat: -27.4844077,
    lng: -58.7864115,
  },
  {
    id: "independencia-3540",
    name: "Av. Independencia 3540",
    address: "Av. Independencia 3540, Corrientes",
    mapsQuery: "Av. Independencia 3540, Corrientes, Argentina",
    lat: -27.4796606,
    lng: -58.8081457,
  },
  {
    id: "gutemberg",
    name: "Calle Gutemberg",
    address: "Gutemberg 1670, Corrientes",
    mapsQuery: "Gutemberg 1670, Corrientes, Argentina",
    lat: -27.477126,
    lng: -58.8316569,
  },
  {
    id: "libertad",
    name: "Av. Libertad",
    address: "Av. Libertad 5279, Corrientes",
    mapsQuery: "Av. Libertad 5279, Corrientes, Argentina",
    lat: -27.4653257,
    lng: -58.7855411,
  },
  {
    id: "maipu",
    name: "Av. Maipú",
    address: "Av. Maipú 7185, Corrientes",
    mapsQuery: "Av. Maipú 7185, Corrientes, Argentina",
    lat: -27.5265807,
    lng: -58.7955942,
  },
];
