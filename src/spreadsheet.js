var GoogleSpreadsheet = require('google-spreadsheet');

//pull id from external file
var id = require('../spreadsheetid.json');
var sheetid = id["id"];

var doc = new GoogleSpreadsheet(sheetid);

var moment = require('moment');

var fs = require('fs');

var coordinates = {};

//added sitepath and panopath so it goes straight into site source
var sitepath = "../nycmeshnet.github.io/map/nodes/";
var panopath = "../nycmeshnet.github.io/panorama/";

function setAuth(cb) {
  var creds = require('../credentials.json');
  console.log("Authorizing with sheets API...")
  doc.useServiceAccountAuth(creds, cb);
}

function generateJson() {
  console.log("Fetching nodes...")
  doc.getRows(3, function(err, rows) { //third worksheet is nodes
    if (err) {
      console.log(err)
      return
    }

    var active = { "type": "FeatureCollection", "features": [] },
      potential = { "type": "FeatureCollection", "features": [] };

    var statusCounts = {}

    var features = rows.map(pointFromRow).filter(removeAbandoned)

    features.forEach((feature) => {
      const { status, id } = feature.properties;
      if (status == "Installed") {
        active.features.push(feature)
      } else {
        potential.features.push(feature)
      }
      coordinates[id] = feature.geometry.coordinates;
      statusCounts[status] = statusCounts[status]+1 || 1;
      statusCounts['total'] = statusCounts['total']+1 || 1;
    })

    //fix problem where nodes are in same location but only the top one is visible on map
	console.log("clusterSameLoc for active")
	clusterSameLoc(active.features)
	console.log("clusterSameLoc for potential")
	clusterSameLoc(potential.features)

    printStats(statusCounts)
    generateLinks()
    writeFile(sitepath + 'active.json', active)
    writeFile(sitepath + 'potential.json', potential)
  })
}

// merge markers with same coordinates
function clusterSameLoc(nodeArray) {
	var fP = 4 //float precision
	//add roof to notes for first node in cluster
	var roofAccess = ""
	for (var currID = 0; currID < nodeArray.length; currID++){
	  // loop down through array gathering panorama, notes and node numbers
	  // for nodes with the same coord. also delete these instances.
	  var currLoc = nodeArray[currID].geometry.coordinates
	  var otherNodes = ""
	  var otherNotes = ""

	  for (var i = nodeArray.length - 1; i > currID; i--) {
	  	//allow for very close location by rounding float to fP (4) places
	    var loc = nodeArray[i].geometry.coordinates
		if (loc[0].toFixed(fP) == currLoc[0].toFixed(fP) && loc[1].toFixed(fP) == currLoc[1].toFixed(fP)){
			otherNodes = ", "+nodeArray[i].properties.id+otherNodes
			// concatenate notes
			var notes = nodeArray[i].properties.notes
		//	nodeArray[i].properties.notes = "hello world"
			if (notes != ""){
				otherNotes = otherNotes+", "+notes
			}
			// concatenate panoramas
			if (nodeArray[i].properties.panoramas){
				if (nodeArray[currID].properties.panoramas){
				   nodeArray[currID].properties.panoramas = nodeArray[currID].properties.panoramas.concat(nodeArray[i].properties.panoramas)
			    } else {
				   nodeArray[currID].properties.panoramas = nodeArray[i].properties.panoramas
				}
			}
			//delete node at index i with duplicate loc!
			nodeArray.splice(i, 1)
		 }
	   }
	if (nodeArray[currID].properties.roof !== ""){
		roofAccess = " -"+nodeArray[currID].properties.roof
	}else{roofAccess = ""}
	nodeArray[currID].properties.otherNodes = otherNodes
    nodeArray[currID].properties.notes = nodeArray[currID].properties.notes+otherNotes + roofAccess //" "+nodeArray[currID].properties.roof

  }
}

function printStats(statusCounts) {
  console.log((statusCounts['total'] || 0)+' nodes ('+
  (statusCounts['Installed'] || 0)+' active, '+
  (statusCounts['Installation Scheduled'] || 0)+' scheduled, '+
  (statusCounts['Interested'] || 0)+' interested, '+
  (statusCounts[''] || 0)+' no status)')
}

function generateLinks() {
  console.log("Fetching links...")
  doc.getRows(4, function(err, rows) { //third worksheet is nodes
    if (err) { console.log(err); return }
    const links = { "type": "FeatureCollection", "features": rows.map(linkFromRow) };
    writeFile(sitepath + 'links.json', links)
  })
}

function removeAbandoned(feature) {
  if (!feature) return false
  //added Unsubscribe bh
  if (feature.properties.status == "Abandoned" || feature.properties.status == "Unsubscribe") return false
  return true
}

function writeFile(path, json) {
  fs.writeFile(path, JSON.stringify(json), function(err) {
    if (err) console.error("Error writing to " + path, err)
    else console.log("GeoJSON written to " + path)
  })
}

function linkFromRow(row) {
  // get coordinates
  // console.log(coordinates[row.from])
  if (row && row.from && row.to && row.status) {
    var feature = { "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          coordinates[row.from], coordinates[row.to]
        ]
      },
      properties: {
        status: row.status
      }
    }
    return feature
  }
}

function pointFromRow(row, index) {

  const { status, latlng, rooftopaccess, notes } = row;
  const id = index+2; // correcting for title row and starts at 0

  var coordinates = latlng.split(', ').reverse().map(function(c) {
    return parseFloat(c)
  })

  if (!coordinates[0]) {
    console.log('Node '+id+' is missing latlng')
    return null
  }

  var feature = {
    type: "Feature",
    properties: {
      id: id,
      status: status,
	  notes: notes
    },
    geometry: {
      coordinates: coordinates,
      type: "Point"
    }
  }

  if (notes) {
    feature.properties.notes = notes;
  }

  if (rooftopaccess && rooftopaccess != '') {
    feature.properties.roof = "roof";
  } else{feature.properties.roof = "";}

  // get panoramas <id>.jpg <id>a.jpg up to <id>z.jpg
  var panLetter = ""
  var panArray = []
  for (var i = 0; i < 27; i++) {
	var fname = id+panLetter+'.jpg'
	var fname_png = id+panLetter+'.png'
	if (fs.existsSync(panopath+fname)) {
		panArray.push(fname)
	}else if (fs.existsSync(panopath+fname_png)) {
		panArray.push(fname_png)
	}else{
		break
	}
	panLetter = String.fromCharCode(97 + i); // a through z
   }
   if (panArray.length > 0){
	feature.properties.panoramas = panArray
   }

  return feature;
}

module.exports = () => setAuth(generateJson)