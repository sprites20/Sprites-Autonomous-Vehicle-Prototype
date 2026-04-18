import React, { useState, useEffect } from 'react';
import { MousePointer2, Info, Search } from 'lucide-react'; // Added Search icon
import { Mesh } from 'three';

let selectedMesh = null;

export function setSelectedMesh(data) {
  selectedMesh = data;
}

export function getSelectedMesh() {
  return selectedMesh;
}

// Placeholder data for categories and items
const categoriesData = [
  { id: 'electronics', name: 'Devices' },
  { id: 'apparel', name: 'Characters' },
  { id: 'home_goods', name: 'Props' },
  { id: 'books', name: 'Environments' }, // Renamed for a mesh context
  { id: 'sports', name: 'Vehicles' },    // Renamed for a mesh context
];

const itemsData = [
  {
    id: 'mesh1',
    name: 'High-Poly Laptop Model',
    category: 'electronics',
    description: 'Detailed 3D model of a modern laptop, optimized for rendering. Includes PBR textures.',
    imageUrl: 'https://placehold.co/400x300/F0F8FF/000000?text=Laptop+Mesh',
    meshUrl: 'https://placehold.co/400x300/F0F8FF/000000?text=Laptop+Mesh',
    scale: [1, 1, 1],
    offset: [0, 0, 0],
  },
  {
    id: 'mesh2',
    name: 'Wireless Headset Asset',
    category: 'electronics',
    description: 'Game-ready asset for a wireless headset, with low-poly count and baked normals.',
    imageUrl: 'https://placehold.co/400x300/E6E6FA/000000?text=Headset+Mesh',
  },
  {
    id: 'mesh3',
    name: 'Futuristic Smartwatch',
    category: 'electronics',
    description: 'Stylized 3D model of a futuristic smartwatch, suitable for UI mockups or game props.',
    imageUrl: 'https://placehold.co/400x300/FFF0F5/000000?text=Smartwatch+Mesh',
  },
  {
    id: 'mesh4',
    name: 'Male Character Base Mesh',
    category: 'apparel', // Now represents 'Characters'
    description: 'A versatile male character base mesh, ideal for sculpting and animation rigging.',
    imageUrl: 'https://placehold.co/400x300/F0FFF0/000000?text=Male+Base+Mesh',
  },
  {
    id: 'mesh5',
    name: 'Female Character Base Mesh',
    category: 'apparel',
    description: 'A clean female character base mesh, ready for custom outfits and facial expressions.',
    imageUrl: 'https://placehold.co/400x300/F5FFFA/000000?text=Female+Base+Mesh',
  },
  {
    id: 'mesh6',
    name: 'Fantasy Knight Armor',
    category: 'apparel',
    description: 'Modular fantasy knight armor set, with separate pieces for customization.',
    imageUrl: 'https://placehold.co/400x300/F8F8FF/000000?text=Armor+Mesh',
  },
  {
    id: 'mesh7',
    name: 'Coffee Mug Prop',
    category: 'home_goods', // Now represents 'Props'
    description: 'Simple coffee mug prop, optimized for real-time rendering. Available in various material presets.',
    imageUrl: 'https://placehold.co/400x300/FAEBD7/000000?text=Mug+Prop',
  },
  {
    id: 'mesh8',
    name: 'Abstract Decorative Vase',
    category: 'home_goods',
    description: 'Sculptural vase model, perfect for interior visualization projects.',
    imageUrl: 'https://placehold.co/400x300/F0F8FF/000000?text=Vase+Prop',
  },
  {
    id: 'mesh9',
    name: 'Smart Speaker Device',
    category: 'home_goods',
    description: 'Detailed model of a smart home speaker, includes emissive material for lights.',
    imageUrl: 'https://placehold.co/400x300/E0FFFF/000000?text=Speaker+Prop',
  },
  {
    id: 'mesh10',
    name: 'Sci-Fi Corridor Segment',
    category: 'books', // Now represents 'Environments'
    description: 'Modular sci-fi corridor segment, can be tiled to create complex level designs.',
    imageUrl: 'https://placehold.co/400x300/DCDCDC/000000?text=Corridor+Env',
  },
  {
    id: 'mesh11',
    name: 'Forest Clearing Scene',
    category: 'books',
    description: 'A peaceful forest clearing environment, with customizable foliage and lighting setup.',
    imageUrl: 'https://placehold.co/400x300/F5DEB3/000000?text=Forest+Env',
  },
  {
    id: 'mesh12',
    name: 'Sports Car Model',
    category: 'sports', // Now represents 'Vehicles'
    description: 'Aerodynamic sports car model with detailed exterior and interior, ready for animation.',
    imageUrl: 'https://placehold.co/400x300/F0E68C/000000?text=Sports+Car',
  },
  {
    id: 'mesh13',
    name: 'Spaceship Interceptor',
    category: 'sports',
    description: 'Fast and agile spaceship model, ideal for space combat simulations or cinematic shots.',
    imageUrl: 'https://placehold.co/400x300/B0E0E6/000000?text=Spaceship',
  },
  {
    id: 'mesh14',
    name: 'Birch Tree',
    category: 'books',
    description: 'A birch tree',
    imageUrl: 'https://images.free3d.com/imgd/l12865-birch-tree-48016.jpg',
  },
];

export const Catalog = () => {

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState(''); // New state for search term
  const [filteredItems, setFilteredItems] = useState([]);

  useEffect(() => {
    // Filter by category
    const categoryFiltered = selectedCategory
      ? itemsData.filter(item => item.category === selectedCategory)
      : itemsData;

    // Further filter by search term
    const finalFiltered = searchTerm
      ? categoryFiltered.filter(item =>
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.description.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : categoryFiltered;

    setFilteredItems(finalFiltered);
  }, [selectedCategory, searchTerm]); // Depend on both category and search term

  // Handle mesh selection (for now, just logs to console)
  const handleSelectMesh = (mesh) => {
    console.log(`Mesh selected: ${mesh.name}`);
    setSelectedMesh(mesh);
    // In a real application, you might load this mesh into a 3D viewer or trigger an event.
    // Replaced alert with a custom message box for better UX
    // For a real application, this would be a modal or similar custom UI.
    const messageBox = document.createElement('div');
    messageBox.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50';
    messageBox.innerHTML = `
      <div class="bg-white p-8 rounded-lg shadow-xl max-w-sm w-full text-center">
        <h3 class="text-2xl font-bold text-indigo-700 mb-4">Mesh Selected!</h3>
        <p class="text-gray-700 mb-6">You have selected: <span class="font-semibold">${mesh.name}</span></p>
        <button id="closeMessageBox" class="bg-indigo-600 text-white py-2 px-6 rounded-lg hover:bg-indigo-700 transition-colors duration-300">
          OK
        </button>
      </div>
    `;
    document.body.appendChild(messageBox);

    document.getElementById('closeMessageBox').onclick = () => {
      document.body.removeChild(messageBox);
    };
  };

  return (
    // Outer container for static sizing (e.g., full screen height with scrolling)
    <div className="h-screen bg-gray-20 font-inter text-gray-800">
      
        <div className="h-full overflow-y-auto p-6">
        <div className="w-full max-w-7xl mx-auto bg-white/20 backdrop-blur-md rounded-2xl shadow-lg p-8">

        {/* Header */}
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-indigo-700 leading-tight">
            3D Mesh Catalog
          </h1>
          <p className="mt-3 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
            Browse and select 3D models across various categories.
          </p>
        </header>

        {/* Search Input */}
        <div className="max-w-xl mx-auto mb-10">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Search meshes by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-full border-2 border-indigo-200 focus:border-indigo-500
                         outline-none text-gray-700 placeholder-gray-400 shadow-sm text-base transition-all duration-300"
            />
            <Search size={20} className="absolute left-4 text-indigo-400" />
          </div>
        </div>

        {/* Categories Navigation */}
        <nav className="mb-10 flex flex-wrap justify-center gap-2 sm:gap-4">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-5 py-2 rounded-full text-sm sm:text-base font-medium transition-all duration-300
              ${selectedCategory === null
                ? 'bg-indigo-600 text-white shadow-lg transform scale-105'
                : 'bg-white text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 shadow-md'
              }`}
          >
            All Meshes
          </button>
          {categoriesData.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-5 py-2 rounded-full text-sm sm:text-base font-medium transition-all duration-300
                ${selectedCategory === category.id
                  ? 'bg-indigo-600 text-white shadow-lg transform scale-105'
                  : 'bg-white text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 shadow-md'
                }`}
            >
              {category.name}
            </button>
          ))}
        </nav>

        {/* Items Display */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.length > 0 ? (
            filteredItems.map(item => (
              <div
                key={item.id}
                className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300
                           flex flex-col overflow-hidden transform hover:-translate-y-1"
              >
                {/* Item Image */}
                <div className="relative w-full h-48 bg-gray-100 flex items-center justify-center">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="object-cover w-full h-full rounded-t-xl"
                    onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/400x300/cccccc/333333?text=Image+Error`; }}
                  />
                  <span className="absolute top-2 right-2 bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                    {categoriesData.find(cat => cat.id === item.category)?.name || item.category.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </span>
                </div>

                {/* Item Details */}
                <div className="p-5 flex flex-col flex-grow">
                  <h2 className="text-xl font-bold text-indigo-800 mb-2 leading-tight">{item.name}</h2>
                  <p className="text-gray-600 text-sm mb-3 flex-grow">{item.description}</p>
                  <button
                    onClick={() => handleSelectMesh(item)}
                    className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg flex items-center justify-center gap-2
                                     hover:bg-indigo-700 transition-colors duration-300 shadow-md hover:shadow-lg"
                  >
                    <MousePointer2 size={20} /> Select Mesh
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-10">
              <Info size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-xl text-gray-500">No meshes found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
};