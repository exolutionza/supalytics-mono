import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Dashboard from './renderer';  // Adjust the import path as needed

const DashboardPage = () => {
  const { id } = useParams();
  const [screenSize, setScreenSize] = useState('desktop');
  console.log("dsasdsad")
  useEffect(() => {
    // Function to determine screen size
    const getScreenSize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        return 'mobile';
      } else if (width < 1024) {
        return 'tablet';
      }
      return 'desktop';
    };

    // Set initial screen size
    setScreenSize(getScreenSize());

    // Add resize listener
    const handleResize = () => {
      setScreenSize(getScreenSize());
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // If no id is provided, you might want to handle that case
  if (!id) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-red-600">
          No dashboard ID provided
        </h2>
      </div>
    );
  }

  return <Dashboard dashboardId={id} screenSize={screenSize} />;
};

export default DashboardPage;