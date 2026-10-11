declare module '*.geojson' {
  const value: {
    type: string;
    features: Array<{
      type: string;
      properties: Record<string, any>;
      geometry: {
        type: string;
        coordinates: any;
      };
    }>;
    metadata?: Record<string, any>;
  };
  export default value;
}
