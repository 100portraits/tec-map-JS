import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import './index.css';
import { ChromePicker } from 'react-color';
import * as d3ScaleChromatic from 'd3-scale-chromatic';

// Define ColorPicker component
function ColorPicker({ color, onChange }) {
  const [displayColorPicker, setDisplayColorPicker] = useState(false);

  const handleClick = () => {
    setDisplayColorPicker(!displayColorPicker);
  }

  const handleClose = () => {
    setDisplayColorPicker(false);
  }

  const popover = {
    position: 'absolute',
    zIndex: '2',
  }
  const cover = {
    position: 'fixed',
    top: '0px',
    right: '0px',
    bottom: '0px',
    left: '0px',
  }
  const swatch = {
    padding: '5px',
    background: '#fff',
    display: 'inline-block',
    cursor: 'pointer',
  }
  const colorStyle = {
    width: '36px',
    height: '14px',
    borderRadius: '2px',
    background: `${color}`,
  }

  return (
    <div>
      <div style={ swatch } onClick={ handleClick }>
        <div style={ colorStyle } />
      </div>
      { displayColorPicker ? (
        <div style={ popover }>
          <div style={ cover } onClick={ handleClose }/>
          <ChromePicker color={ color } onChange={ onChange } />
        </div>
      ) : null }
    </div>
  )
}

function App() {
  const [data, setData] = useState(null);
  const [geoData, setGeoData] = useState(null);

  const [color, setColor] = useState('#ff0000');
  const [sizeColumn, setSizeColumn] = useState('');

  const [latColumn, setLatColumn] = useState('');
  const [lonColumn, setLonColumn] = useState('');
  const [columns, setColumns] = useState([]);

  const [plotType, setPlotType] = useState('point'); // 'point' or 'choropleth'

  const [choroplethColumn, setChoroplethColumn] = useState('');
  const [choroplethKeyColumn, setChoroplethKeyColumn] = useState('');
  const [colorScheme, setColorScheme] = useState('interpolateViridis');

  const [countryFillColor, setCountryFillColor] = useState('#cccccc');
  const [countryBorderColor, setCountryBorderColor] = useState('#000000');
  const [fillCountriesWithPoints, setFillCountriesWithPoints] = useState(false);
  const [countryPointFillColor, setCountryPointFillColor] = useState('#00ff00');

  const svgRef = useRef();

  // Load GeoJSON data (Europe countries)
  useEffect(() => {
    d3.json('https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/GeoJSON/europe.geojson')
      .then(geojson => {
        setGeoData(geojson);
      })
      .catch(err => console.error('Error loading GeoJSON:', err));
  }, []);

  const drawMap = () => {
    if (!geoData) {
      console.error('GeoData not loaded');
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous content

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const projection = d3.geoAzimuthalEqualArea()
      .rotate([-10, -52])
      .translate([width / 2, height / 2])
      .scale(800);

    const path = d3.geoPath().projection(projection);

    // Draw countries
    svg.selectAll('path')
      .data(geoData.features)
      .enter()
      .append('path')
      .attr('d', path)
      .attr('stroke', countryBorderColor)
      .attr('fill', countryFillColor);

    if (plotType === 'point') {
      if (!data) {
        console.error('Data not loaded');
        return;
      }

      // Parse latitude and longitude from the data
      data.forEach(d => {
        d.latitude = +d[latColumn];
        d.longitude = +d[lonColumn];
      });

      // Filter out data points with invalid lat/lon
      const validData = data.filter(d => !isNaN(d.latitude) && !isNaN(d.longitude));

      let sizeScale = null;
      if (sizeColumn) {
        const sizeValues = validData.map(d => +d[sizeColumn]).filter(v => !isNaN(v));
        const minSize = d3.min(sizeValues);
        const maxSize = d3.max(sizeValues);
        if (sizeValues.length === 0 || minSize === maxSize) {
          sizeScale = () => 10; // Default size if no valid data or all values are the same
        } else {
          sizeScale = d3.scaleLinear()
            .domain([minSize, maxSize])
            .range([5, 20]);
        }
      }

      // Draw circles
      svg.selectAll('circle')
        .data(validData)
        .enter()
        .append('circle')
        .attr('cx', d => projection([d.longitude, d.latitude])[0])
        .attr('cy', d => projection([d.longitude, d.latitude])[1])
        .attr('r', d => sizeColumn && sizeScale ? sizeScale(+d[sizeColumn]) : 5)
        .attr('fill', color);

      if (fillCountriesWithPoints) {
        // Create a set of country names where points are located
        const countriesWithPoints = new Set();

        validData.forEach(d => {
          geoData.features.forEach(feature => {
            if (d3.geoContains(feature, [d.longitude, d.latitude])) {
              countriesWithPoints.add(feature.properties.NAME);
            }
          });
        });

        // Update country fill colors
        svg.selectAll('path')
          .attr('fill', d => countriesWithPoints.has(d.properties.NAME) ? countryPointFillColor : countryFillColor);
      }

    } else if (plotType === 'choropleth') {
      if (!data) {
        console.error('Data not loaded');
        return;
      }

      if (!choroplethKeyColumn || !choroplethColumn) {
        console.error('Choropleth columns not selected');
        return;
      }

      // Create a data map based on a common property (e.g., country code)
      const dataMap = {};
      data.forEach(d => {
        const key = d[choroplethKeyColumn];
        const value = +d[choroplethColumn];
        if (key && !isNaN(value)) {
          dataMap[key] = value;
        }
      });

      // Define color scale
      const colorInterpolator = d3ScaleChromatic[colorScheme];
      const values = Object.values(dataMap);
      const minVal = d3.min(values);
      const maxVal = d3.max(values);
      const colorScale = d3.scaleSequential(colorInterpolator)
        .domain([minVal, maxVal]);

      // Update country fill colors
      svg.selectAll('path')
        .attr('fill', d => {
          const countryCode = d.properties.ISO2; // Adjust based on your GeoJSON properties
          const value = dataMap[countryCode];
          return value != null ? colorScale(value) : countryFillColor;
        });
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      d3.csv(URL.createObjectURL(file))
        .then(data => {
          setData(data);
          const cols = Object.keys(data[0]);
          setColumns(cols);
          setLatColumn(cols.includes('latitude') ? 'latitude' : cols[0]);
          setLonColumn(cols.includes('longitude') ? 'longitude' : cols[1] || cols[0]);
          setChoroplethKeyColumn(cols[0]); // default to first column
          setChoroplethColumn(cols[1] || cols[0]);
        })
        .catch(err => console.error('Error parsing CSV:', err));
    }
  };

  const downloadSVG = () => {
    const svgElement = svgRef.current;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);

    // Add name spaces.
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
      source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    // Add XML declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'map.svg';
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 flex">
      {/* Controls */}
      <div className="w-1/3 p-4 overflow-auto">
        <h1 className="text-2xl font-bold mb-4">Geospatial Data Plotter</h1>

        {/* Plot Type Toggle */}
        <div className="mb-4">
          <label className="mr-2 font-bold">Plot Type:</label>
          <select value={plotType} onChange={e => setPlotType(e.target.value)}>
            <option value="point">Point Plot</option>
            <option value="choropleth">Choropleth</option>
          </select>
        </div>

        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="mb-4"
        />

        {data && (
          <>
            {plotType === 'point' && (
              <>
                <div className="mb-4">
                  <label className="mr-2">Latitude Column:</label>
                  <select value={latColumn} onChange={e => setLatColumn(e.target.value)}>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="mr-2">Longitude Column:</label>
                  <select value={lonColumn} onChange={e => setLonColumn(e.target.value)}>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="mr-2">Size Based On:</label>
                  <select value={sizeColumn} onChange={e => setSizeColumn(e.target.value)}>
                    <option value="">Select Column</option>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="mr-2">Select Dot Color:</label>
                  <ColorPicker color={color} onChange={(c) => setColor(c.hex)} />
                </div>
                <div className="mb-4">
                  <label className="mr-2">Fill Countries with Points:</label>
                  <input
                    type="checkbox"
                    checked={fillCountriesWithPoints}
                    onChange={e => setFillCountriesWithPoints(e.target.checked)}
                  />
                </div>
                {fillCountriesWithPoints && (
                  <div className="mb-4">
                    <label className="mr-2">Country Fill Color:</label>
                    <ColorPicker color={countryPointFillColor} onChange={(c) => setCountryPointFillColor(c.hex)} />
                  </div>
                )}
              </>
            )}

            {plotType === 'choropleth' && (
              <>
                <div className="mb-4">
                  <label className="mr-2">Country Code Column:</label>
                  <select value={choroplethKeyColumn} onChange={e => setChoroplethKeyColumn(e.target.value)}>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="mr-2">Data Column for Choropleth:</label>
                  <select value={choroplethColumn} onChange={e => setChoroplethColumn(e.target.value)}>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="mr-2">Select Color Scheme:</label>
                  <select value={colorScheme} onChange={e => setColorScheme(e.target.value)}>
                    {Object.keys(d3ScaleChromatic).filter(name => name.startsWith('interpolate')).map(name => (
                      <option key={name} value={name}>{name.replace('interpolate', '')}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Common Controls */}
            <div className="mb-4">
              <label className="mr-2">Country Background Color:</label>
              <ColorPicker color={countryFillColor} onChange={(c) => setCountryFillColor(c.hex)} />
            </div>
            <div className="mb-4">
              <label className="mr-2">Country Border Color:</label>
              <ColorPicker color={countryBorderColor} onChange={(c) => setCountryBorderColor(c.hex)} />
            </div>

            <button
              className="mb-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              onClick={drawMap}
            >
              Update Map
            </button>

            <button
              className="mb-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded ml-2"
              onClick={downloadSVG}
            >
              Download as SVG
            </button>
          </>
        )}
      </div>

      {/* Map */}
      <div className="w-2/3 p-4">
        <div className="overflow-auto">
          <svg ref={svgRef} width="100%" height="800"></svg>
        </div>
      </div>
    </div>
  );
}

export default App;
