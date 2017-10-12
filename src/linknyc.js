const fetch = require("node-fetch");
const fs = require('fs')

const generateGeoJson = () => {
  console.log("Fetching Link NYC...")
  fetch(
    "https://data.cityofnewyork.us/api/views/s4kf-3yrf/rows.json?accessType=DOWNLOAD"
  )
    .then(res => res.json())
    .then(res => {
      const { data } = res;
      const geojson = {
        type: "FeatureCollection",
        features: data.map(rowToFeature)
      }
      writeFile("../nycmeshnet.github.io/map/nodes/linkNYC.json", geojson)
    })
    .catch(err => {
      console.log(err);
    });
};

const statusTypes = {
  'Link Active!': 'active',
  'Link Pending Activation': 'pending',
  'Link Installed; Connecting Power and Fiber': 'installed'
}

const rowToFeature = (row) => {
  const id = row[1]
  const lat = parseFloat(row[12])
  const lng = parseFloat(row[13])
  const street = row[16]
  const neighborhood = row[21]
  const borough = row[9]
  const status = statusTypes[row[14]]
  // console.log(`${status} ${lat},${lng} ${street}, ${neighborhood}, ${borough}`)
  return {
    type: "Feature",
    properties: {
      id: id,
      status: status
    },
    geometry: {
      coordinates: [lng,lat],
      type: "Point"
    }
  };
}

function writeFile(path, json) {
  fs.writeFile(path, JSON.stringify(json), function(err) {
    if (err) console.error("Error writing to " + path, err);
    else console.log("GeoJSON written to " + path);
  });
}

module.exports = generateGeoJson;
