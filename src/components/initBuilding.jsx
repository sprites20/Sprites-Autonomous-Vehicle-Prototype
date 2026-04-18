
<group position={[50, -50, 20]}>
  {/* Left Wing */}
  <group position={[-10, 0, 0]}> 
    <ProceduralRectangularLayout 
      buildingWidth={20} 
      buildingDepth={40} 
      floors={60} 
      floorHeight={4.5}
      core_x_span={6}     
      core_z_span={8}    
      core_wall_thickness={0.5} 
      elevators={2}
      perimeter_column_thickness={1.0} 
      extra_columns_side="left" // extra columns facing the connection
    />
  </group>

  {/* Right Wing */}
  <group position={[10, 0, 0]}> 
    <ProceduralRectangularLayout 
      buildingWidth={20}
      buildingDepth={40}
      floors={60} 
      floorHeight={4.5}
      core_x_span={6}     
      core_z_span={8}    
      core_wall_thickness={0.5} 
      elevators={1} 
      perimeter_column_thickness={1.0} 
      extra_columns_side="right" // extra columns facing the connection
    />
  </group>

  {/* Connection Columns along the junction */}
  <group>
    {/* Example: columns spanning from floor 0 to 60 along the connecting wall */}
    {Array.from({ length: 5 }).map((_, i) => (
      <mesh key={i} position={[-10 + i * 5, 105, 0]}>
        <boxGeometry args={[1, 210, 1]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
    ))}
  </group>
  <group>
    {Array.from({ length: 10 }).map((_, i) => (
      Array.from({ length: 5 }).map((_, j) => (
        <ApartmentRoom position={[(j-2)*8-4, (i*4.5)-1.8, 9.5]} rotation={[0, 0, 0]} />
      ))
    ))}
    
  </group>


</group>