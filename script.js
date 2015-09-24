(function() {
    // The canvas to draw the map on
    var svg = d3.select("#canvas > svg");

    // Voronoi function
    var voronoi = d3.geom.voronoi()
        .clipExtent([[-178.218, 18.9218], [-66.9693, 71.4062]]);

    // A color scale for how close the states are
    var color = d3.scale.linear()
            .clamp(true)
            .range(["#2b8cbe", "#a6bddb", "#ece7f2"]);

    // Set display projection
    var projection = d3.geo.albers();

    // Create path variable for plotting states
    var path = d3.geo.path()
            .projection(projection);

    // This will hold the data as it comes in
    var data = {};

    // Load state boundaries
    d3.json("http://data.jquerygeo.com/usastates.json", (error, states) => {
        data.states = states;
        render();
    });

    // Load great lakes boundaries
    d3.json("//gist.githubusercontent.com/tristanwietsma/6046119/raw/f5e8654b5a811199d2f2190b3090d1c1e3488436/greatlakes.geojson", (error, lakes) => {
        data.lakes = lakes;
        render();
    });

    // Once both pieces of data are loaded, begin processing
    function render() {
        if (Object.keys(data).length < 2)
            return;

        // Turn lakes into a point cloud and find voronoi diagram of those points
        var lakes = [].concat.apply([], data.lakes.features.map(l => points(l.geometry)))
            .filter(unique());
        var vor = voronoi(lakes);

        // I've had issue getting the projection of Alaska and Hawaii to work, so filter them out
        data.states.features = data.states.features
            .filter(f => f.properties.abbr !== "AK" && f.properties.abbr !== "HI");

        /*
         * Iterate over each state to find it's centroid and distance from the
         * grad lakes. Distance here is the largest distance of the
         * intersection of a voronoi polygon and the state boundary to the
         * point corresponding to that voronoi polygon. 
         */
        for (feature of data.states.features) {
            var statePoints = points(feature.geometry);
            feature.properties.center = centroidArea(feature.geometry)[0];
            // Here we pass back the max distance, and the corresponding point
            var distInfo = _.max(polys(feature.geometry).map(poly => {
                return _.max(vor.map(tri => {
                    var intersections = polybool(poly, tri);
                    return _.max(intersections.map(poly => {
                        return _.max(poly.map(p => [distance(p, tri.point), p]), m => m[0]);
                    }), m => m[0]);
                }), m => m[0]);
            }), m => m[0]);
            feature.properties.dist = distInfo[0];
            feature.properties.location = distInfo[1];
        }

        // Find the maximum distance to calibrate the color space
        var maxDist = _.max(data.states.features.map(f => f.properties.dist));
        color.domain([0, 0.5 * maxDist, maxDist]);

        // Processing is done, remove the spinner
        d3.select("#spinner").style("display", "none");

        // Colored States
        svg.append("g").attr("class", "states").selectAll("g")
            .data(data.states.features).enter()
            .append("g")
            .append("path")
            .style("fill", d => color(d.properties.dist))
            .attr("d", path);

        // Lakes
        svg.append("g").attr("class", "lakes").selectAll("path")
            .data(data.lakes.features).enter()
            .append("path")
            .attr("d", path);

        // Mouse over info
        // This must appear after everything else, so it's not clipped by neighbors
        var info = svg.append("g").attr("class", "info").selectAll("g")
            .data(data.states.features).enter()
            .append("g")

        info.append("path")
            .attr("d", path);

        info.append("circle")
            .attr("cx", d => projection(d.properties.location)[0])
            .attr("cy", d => projection(d.properties.location)[1])
            .attr("r", ".2em");

        info.append("text")
            .attr("x", d => projection(d.properties.center)[0])
            .attr("y", d => projection(d.properties.center)[1])
            .text(d => d.properties.dist.toFixed(0));
    }

    // Takes a geometry and returns only its points
    function points(geometry) {
        switch (geometry.type) {
            case "MultiPolygon":
                return [].concat.apply([], [].concat.apply([], geometry.coordinates));
            case "Polygon":
                return [].concat.apply([], geometry.coordinates);
            case "GeometryCollection":
                return [].concat.apply([], geometry.geometries.map(points));
            default:
                console.error("Unhandled geometry type: " + geometry.type);
        }
    }

    // Take a geometry and returns an array of polygons
    function polys(geometry) {
        switch (geometry.type) {
            case "MultiPolygon":
                return [].concat.apply([], geometry.coordinates);
            case "Polygon":
                return geometry.coordinates;
            case "GeometryCollection":
                return [].concat.apply([], geometry.geometries.map(polys));
            default:
                console.error("Unhandled geometry type: " + geometry.type);
        }
    }

    // Given a geometry return the area and centroid of its largest polygon
    function centroidArea(geometry) {
        switch (geometry.type) {
            case "Polygon":
                var poly = d3.geom.polygon(geometry.coordinates[0]);
                return [poly.centroid(), poly.area()]
            case "GeometryCollection":
                return _.max(geometry.geometries.map(centroidArea), ca => ca[1]);
            default:
                console.error("Unhandled geometry type: " + geometry.type);
        }
    }

    // Calculates the distance between two points in miles
    var earthRadius = 3959; // Miles
    function distance(x, y) {
        var cp1 = Math.cos(x[1] * Math.PI / 180);
        var cp2 = Math.cos(y[1] * Math.PI / 180);
        var sdp = Math.sin((y[1] - x[1]) * Math.PI / 360);
        var sdl = Math.sin((y[0] - x[0]) * Math.PI / 360);

        var a = sdp * sdp + cp1 * cp2 * sdl * sdl;
        return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // Returns a function that when used in conjunction with filter will remove
    // any duplicate elements usage: array.filter(unique())
    function unique() {
        var seen = new Set();
        return p => {
            var hash = JSON.stringify(p);
            if (seen.has(hash)) {
                return false;
            } else {
                seen.add(hash);
                return true;
            }
        };
    }

    // Converts an array of points into an svg path specification
    function polygon(d) {
          return "M" + d.join("L") + "Z";
    }
})();
