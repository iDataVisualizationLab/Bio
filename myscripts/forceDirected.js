var App = App || {};

/**
 * This object requires to have "nodes" and "links"
 *
 * Each object link must have "source", "destination", "name" and either "weight" or "value" as numeric value
 *
 * @param args
 * @constructor
 */
function ForceDirectedGraph(args) {
  Object.assign(this, args || ForceDirectedGraph.prototype);

  this.init();
  // this.filterData(App.data);

  var sortedLinks = this.links.concat().sort((a, b) => {
    return Math.abs(b.value) - Math.abs(a.value);
  });

  this.maxValue = Math.abs(sortedLinks[0].value);

  // initialize color palette
  let availableColors = ['#aec7e8','#ff7f0e','#ffbb78','#2ca02c','#98df8a','#d62728','#ff9896','#9467bd','#c5b0d5','#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'];
  this.colorPalette = {};

  for (let color of availableColors) {
    this.colorPalette[color] = {
      inUse: false,
      currentClusterNumber: -1
    };
  }

  this.defineClusters();

  let nodes = this.nodes;
  // set up simulation
  this.simulation = d3.forceSimulation()
    .force("links",
      d3.forceLink()
        .id(d => d.name)
    )
    .force("collision", d3.forceCollide(22))
    .force("charge", d3.forceManyBody()
      .strength(-Math.pow(150, nodes.length > 30 ? 1 : 1.2))
      .distanceMax(Math.min(this.width, this.height)/4))
    .force("center", d3.forceCenter(
      (this.width / 2),
      (this.height / 2)
    ));

  // update graph
  this.drawGraph();
};

ForceDirectedGraph.prototype = {
  constructor:ForceDirectedGraph,
  // set up svg elements
  init: function() {
    // allows all work to be done using same coordinates initially used
    this.aspect = this.width / this.height;
    // this.width = 901;
    // this.height = this.width / this.aspect;

    // no need to redraw on resize
    this.svg.attr("viewBox", "0 0 " + this.width + " " + this.height);

    // background color
    this.svg.append("rect")
      .attr("width", this.width)
      .attr("height", this.height)
      .style("padding", "20px")
      .style("fill", "#444");

    this.svg.call(d3.zoom()
      .scaleExtent([1 / 2, 4])
      .on("zoom", this.zoomed.bind(this)))
      .on("dblclick.zoom", null);

    // make sure each link has "value" property
    this.links.forEach(function (l) {
        if (!!l.value && !!l.weight) {
            return;
        }

        if (!!l.weight) {
            l.value = l.weight;
        }

        if (!l.value) {
            l.value = 1;
        }
    });

    // make sure each node has its cluster
    this.nodes.forEach(function (n) {

        if (!n.radius) {
            n.radius = 6;
        }

        if (!n.x) {
            n.x = width / 2;
        }

        if (!n.y) {
            n.y = height / 2;
        }

        if (!!n.cluster) {
            return;
        }

        n.cluster = n.community;
    });

    // colors from
    // http://colorbrewer2.org/#type=diverging&scheme=RdYlGn&n=9

    // stroke gradients
    function createSVGLinearGradient(colors, id, defs) {
      var left = defs.append('linearGradient')
        .attr('id',id + 'Left')
        .attr('x1',1)
        .attr('y1',0)
        .attr('x2',0)
        .attr('y2',0);

      for (var i = 0, il = colors.length - 1; i < il; ++i) {
        left.append('stop')
          .attr('offset', Math.floor(i * 100 / il) + '%')
          .attr('stop-color', colors[i]);
      }

      left.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', colors.pop());

      let xid = '#' + id + 'Left';
      defs.append('linearGradient')
          .attr('id', id + 'Right')
          .attr('xlink:href', xid)
          .attr('x1',0)
          .attr('x2',1)
      defs.append('linearGradient')
          .attr('id', id + 'Up')
          .attr('xlink:href', xid)
          .attr('x1',0)
          .attr('y1',1)
      defs.append('linearGradient')
          .attr('id', id + 'Down')
          .attr('xlink:href', xid)
          .attr('x1',0)
          .attr('y2',1)
    }

    var defs = this.svg.append('defs');

    createSVGLinearGradient([
      '#fee08b',
      '#fdae61',
      '#f46d43',
      '#d73027'
    ], 'red', defs);

    createSVGLinearGradient([
      '#d9ef8b',
      '#a6d96a',
      '#66bd63',
      '#1a9850'
    ], 'green', defs);

    this.clusterCircleGroup = this.svg.append("g")
      .attr("class", "clusterGroup");
    this.linkGroup = this.svg.append("g")
      .attr("class", "linkGroup");
    this.nodeGroup = this.svg.append("g")
      .attr("class", "nodeGroup")

    this._isDragging = false;

    this.clusterMode = "timestep"; // or "global" or "window"
    this.globalClustering = null;

    this.windowClustering = null;
    this.windowClusteringRange = 5; // # timesteps before and after current

    /* Initialize tooltip for nodes */
    this.tip = d3.select('#forceDirectedDiv').append('div').attr('id', 'tip');
  },

  resize:function() {
    var rect = this.svg.node().parentNode.getBoundingClientRect();
    if (rect.width && rect.height) {
      this.width = rect.width,
      this.height = rect.height;
    }

    this.svg
      .attr('width', this.width)
      .attr('height', this.height)

    this.aspect = this.width / this.height;
    this.width = 901;
    this.height = this.width / this.aspect;

    this.svg.attr("viewBox", "0 0 " + this.width + " " + this.height);

    this.svg.select('rect')
      .attr('width', this.width)
      .attr('height', this.height)

    var containerWidth = this.svg.node().parentNode.getBoundingClientRect().width;

    // reheat simulation
    if (this.simulation) {
      this.simulation
        .force("center", d3.forceCenter(
          (this.width / 2),
          (this.height / 2)
          ));

      this.simulation.alpha(0.3).restart();
    }
  },
  zoomed: function() {
    this.transform = d3.event.transform;
    this.nodeGroup.attr("transform", this.transform);
    this.linkGroup.attr("transform", this.transform);
    this.clusterCircleGroup.attr("transform", this.transform);
  },
  showTip: function(d, type) {
    this.tip.selectAll('*').remove();
    this.tip.transition().style('opacity',1);

    var self = this;
    function adjustedClusterColor(cluster) {
      var color = d3.hsl(self.clusterColor(cluster))
      if (color.l < 0.65) { color.l = 0.65 }
      return color.toString();
    }

    if (type === 'rule') {
      var sp = this.tip.append('span')
          .text('Rule: ');

      sp.append('span')
          .style('letter-spacing',0)
          .style('font-weight','bold')
          .style('color', adjustedClusterColor(d.cluster))
          .text(d.name);
      sp.append('br');

      sp = sp.append('div')
        .style('font-size','0.85em')
        .style('line-height','1.4em')
        .style('padding-left','0.5vw')
        .style('border-left','0.1vw dotted #ccc');

      sp.append('span')
        .text('Hits: ' + d.hits);

      var selfInf = d.inf.filter(inf => inf.name === d.name);
      var inf = d.inf.filter(inf => inf.name !== d.name)
                  .sort((a,b) => Math.abs(b.flux) - Math.abs(a.flux) );
      var outf = d.outf.filter(outf => outf.name !== d.name)
                  .sort((a,b) => Math.abs(b.flux) - Math.abs(a.flux) );
      var selfCluster = d.cluster;
      var num;

      function adjustedClusterColor(cluster) {
        var color = d3.hsl(self.clusterColor(cluster))
        if (color.l < 0.65) { color.l = 0.65 }
        return color;
      }

      var self = this;
      if (selfInf.length > 0) {
        num = App.property.sci ?
            Number(selfInf[0].flux.toPrecision(3)).toExponential() :
            Number(selfInf[0].flux.toFixed(3))
        sp.append('br');
        sp.append('span')
          .text('Self-influence: ')
          .style('color', function() {
            return adjustedClusterColor(selfCluster);
          })
      sp.append('span')
          .text(num)
          .style('color', function() {
              return num < 0 ? '#f66' : '#4c4';
            });
      }
      if (inf.length > 0) {
        sp.append('br');
        sp.append('span')
          .text('Influence on...');
        inf.slice(0,10).forEach(flux => {
          num = App.property.sci ?
            Number(flux.flux.toPrecision(3)).toExponential() :
            Number(flux.flux.toFixed(3))

          sp.append('br');
          sp.append('span')
            .text(flux.name + ': ')
            .style('margin-left','0.75vw')
            .style('font-weight','bold')
            .style('color', function() {
              var cluster = self.findCluster(flux.name);
              return adjustedClusterColor(cluster);
            });
          sp.append('span')
          .text(num)
          .style('color', function() {
              return flux.flux < 0 ? '#f66' : '#4c4';
            });
        })

        if (inf.length > 10) {
          sp.append('br');
          sp.append('span')
            .text('...and ' + (inf.length-10) + ' more')
            .style('margin-left','0.75vw');
        }
      }
      if (outf.length > 0) {
        sp.append('br');
        sp.append('span')
          .text('Influenced by...');

        outf.slice(0,10).forEach(flux => {
          num = App.property.sci ?
            Number(flux.flux.toPrecision(3)).toExponential() :
            Number(flux.flux.toFixed(3))

          sp.append('br');
          sp.append('span')
            .text(flux.name + ': ')
            .style('margin-left','0.75vw')
            .style('font-weight','bold')
            .style('color', function() {
              var cluster = self.findCluster(flux.name);
              return adjustedClusterColor(cluster);
            });
          sp.append('span')
          .text(num)
          .style('color', function() {
              return flux.flux < 0 ? '#f66' : '#4c4';
            });
        })

        if (outf.length > 10) {
          sp.append('br');
          sp.append('span')
            .text('...and ' + (outf.length-10) + ' more')
            .style('margin-left','0.75vw');
        }
      }
    }
    else {
      var cs = d3.hsl(this.clusterColor(d.source.cluster));
      var ct = d3.hsl(this.clusterColor(d.target.cluster));
      if (cs.l < 0.65) { cs.l = 0.65 }
      if (ct.l < 0.65) { ct.l = 0.65 }

      var sp = this.tip.append('span');
      sp.text('Influence: ')
        .append('span').text(App.property.sci ?
            Number(d.value.toPrecision(3)).toExponential() :
            Number(d.value.toFixed(3)) )
          .style('font-weight','bold')
          .style('color', d.value < 0 ? '#f66' : '#4c4');
      sp.append('br');
      sp.append('span')
          .text(d.source.name)
          .style('letter-spacing',0)
          .style('font-weight','bold')
          .style('color', cs.toString());
      sp.append('br');
      sp.append('text').text('on ');
      sp.append('span')
          .text(d.target.name)
          .style('letter-spacing',0)
          .style('font-weight','bold')
          .style('color', ct.toString());
    }

  },
  hideTip: function() {
    this.tip.transition().style('opacity',0);
  },

  // process data into nodes & links where links have magnitude > 0
  filterData: function(data) {
    var filteredData = {};
    var links = [];

    for (var key in data) {
      var newNode = {
        hits: data[key].hits,
        name: data[key].name,
        inf: data[key].inf.filter(l => l.flux !== 0),
        outf: data[key].outf.filter(l => l.flux !== 0)
      };

      links = _.concat(links, this.extractLinksFromNode(newNode, key));

      if (newNode.inf.length > 0 || newNode.outf.length > 0) {
        filteredData[key] = newNode;
      }
    }

    this.filteredData = filteredData;
    this.links = links;
  },

  extractLinksFromNode: function(node, name) {
    let nodeLinks = [];

    node.inf.forEach(l => {
      nodeLinks.push({
        source: name,
        target: l.name,
        value: l.flux
      });
    });

    return nodeLinks;
  },

  // cluster data based on threshold(s) of influence
  defineClusters: function(alpha) {

    let nodes = this.nodes;
    let clusters = [];
    let addedClusters = {};
    let tmpCluster;

    nodes.forEach(function (n) {
        if (!addedClusters.hasOwnProperty(n.cluster)) {
            addedClusters[n.cluster] = [];
        }

        tmpCluster =  addedClusters[n.cluster];
        let existed = false;
        for(var i =0; i< tmpCluster.length; i++) {
            if (tmpCluster[i] == n) {
                existed = true;
                break;
            }
        }

        if (!existed) {
            tmpCluster.push(n);
        }

    });

    for(var cl in addedClusters) {
        if (!addedClusters.hasOwnProperty(cl)) {
            continue;
        }

        clusters.push(addedClusters[cl]);
    }



    let newColors = new Array(clusters.length);
      for (let color = 0; color < clusters.length; color++) {
          newColors[color] = Object.keys(this.colorPalette)[color];
      }

    this.clusterColors = newColors;
    this.clusters = clusters;

    if (this.simulation && alpha !== 0) {
      this.simulation.alpha(alpha || 0.15).restart();
    }


  },

  // update function
  drawGraph: function() {
    this.drawClusters();
    this.drawNodes();
    this.drawLinks();
    this.createForceLayout();
  },

  drawClusters: function() {
    // let clusters = this.clusters.filter(c => c.length && !(c[0].isPainted && c[0].paintedCluster === undefined));
    let clusters = this.clusters;
    var self = this;

    function getFill(d) {
        return self.clusterColor(d[0].cluster);
    }

    var circles = this.clusterCircleGroup.selectAll(".clusterCircle").data(clusters);

    circles.exit().remove();

    circles
      .style("fill", getFill)
      .style("stroke", getFill);

    circles.enter().append("circle")
      .attr("class", "clusterCircle")
      .style("fill", getFill)
      .style("stroke", getFill)
      .style("stroke-dasharray", "2, 2")
      .style("fill-opacity", 0.3)
      .call(d3.drag()
        .on('start', function(d) {
          if (!d3.event.active) {
            self.simulation.alphaTarget(0.3).restart();
          }
          d.forEach((n) => {
            n._fixed = (n.fx != null);
            n.fx = n.x;
            n.fy = n.y;
          })
        })
        .on('drag', function(d) {
          d.forEach((n) => {
            n.fx += d3.event.dx;
            n.fy += d3.event.dy;
          })
        })
        .on('end', function(d) {
          if (!d3.event.active) {
            self.simulation.alphaTarget(0);
          }
          let cluster = this;

          d.forEach((n) => {
            // pin cluster nodes on cluster drag end (testing out how this feels)
            n._fixed = true;

            d3.selectAll('.rule-node')
              .style('stroke', (d) => d._fixed ? "#404040" : "white");

            d3.select(cluster)
              .style("stroke-dasharray", null);
          })
        }) )
        .on('click', function(d) {
          // unpin cluster and its nodes
          let cluster = this;

          d.forEach((n) => {
            // pin cluster nodes on cluster drag end (testing out how this feels)
            n._fixed = false;
            n.fx = n.fy = null;

            d3.selectAll('.rule-node')
              .style('stroke', (d) => d._fixed ? "#404040" : "white");

            d3.select(cluster)
              .style("stroke-dasharray", "2, 2");
          })
        });
  },

  // draw nodes
  drawNodes: function() {
    // var filteredData = this.filteredData;
    // var radiusScale = d3.scaleLinear()
    //   .domain(d3.extent(Object.keys(filteredData), (d) => {
    //     return filteredData[d].hits;
    //   }))
    //   .range([4, 14]);
    //
    // // scale nodes by # of hits
    // for (var key in filteredData) {
    //   filteredData[key].radius = radiusScale(filteredData[key].hits);
    //   filteredData[key].x = filteredData[key].x || this.width / 2;
    //   filteredData[key].y = filteredData[key].y || this.height / 2;
    // }

    // define dragging behavior
    var self = this;
    var drag = d3.drag()
        .on('start', function(d) {
          if (!d3.event.active) {
            self.simulation.alphaTarget(0.3).restart();
          }
        })
        .on('drag', function(d) {
          self._isDragging = true;
          d3.select(this)
            .style("fill", self.clusterColor(d.cluster))
            .style("stroke", "#404040");
          d._fixed = true;
          d.fx = d3.event.x;
          d.fy = d3.event.y;
        })
        .on('end', function(d) {
          self._isDragging = false;
          if (!d3.event.active) {
            self.simulation.alphaTarget(0);
          }
        });

    var rule = this.nodeGroup.selectAll(".rule-node")
        .data(this.nodes);

    var text = this.nodeGroup.selectAll(".rule-text")
        .data(this.nodes);


    rule.enter().append("circle")
      .attr("class", "rule rule-node")
      .attr("transform", (d, i) => {
        return "translate(" + d.x + ", " + d.y + ")";
      })
    .merge(rule)
      .attr("cluster", d => d.cluster)
      .attr("r", d => d.radius)
      // .attr("pointer-events", (d) => {
      //   if(App.property.node == true && d.cluster === 0) {
      //     return 'none';
      //   }
      //   else return 'all';
      // })
      // .style("opacity", (d) => {
      //   if( App.property.node == true && d.cluster === 0) {
      //     return 0;
      //   }
      //   else return 1;
      // })
      // .style('stroke-opacity', (d) => {
      //   if( App.property.node == true && d.cluster === 0) {
      //     return 0;
      //   }
      //   else return 0.5;
      // })
      .on('mouseover', this._isDragging ? null : function(d) {
        self.showTip(d, 'rule');

        self.linkGroup.selectAll('.link-1')
          .style('stroke-opacity',function() {
            var opacity = d3.select(this).style('stroke-opacity');
            return Math.min(0.4, opacity);
          });

        self.linkGroup.selectAll(".link-2").filter(function(link) {
          return link.source.name === d.name;
        })
          .style('stroke-opacity', 0.6);
      })
      .on("mouseout", function() {
        self.updateEdgeVisibility();

        self.linkGroup.selectAll(".link-2")
          .style('stroke-opacity', 0).interrupt();
        self.hideTip();

      })
      .on('contextmenu', function(d) {
        d3.event.preventDefault();
        d3.select('.node-to-graph')
          .classed('node-to-graph',false);
        d3.select(this)
          .classed('node-to-graph',true);
        d3.select('#linegraph-help').style('display','none');
        // if (App.panels.topVis) { App.panels.topVis.updateRule(d); }
        // if (App.panels.bottomVis) { App.panels.bottomVis.updateRule(d); }
        // if (App.panels.focusSlider) { App.panels.focusSlider.update(); }
      })
      .on('click', function(d) {
        // if painting mode, add node to paintedClusters
        // if (self.paintingManager.isPaintingCluster()) {
        //   self.paintingManager.addNodeToPaintingCluster(d);
        // }
        // else {
          d3.select(this)
            .style("fill", (d) => self.clusterColor(d.cluster))
            .style("stroke", "white");
            d.fx = d.fy = null;
            d._fixed = false;
        // }
      })
      .call(drag);

    // remove as needed
    rule.exit().remove();


    // also add text
    text.enter().append('text')
      .attr('class','rule rule-text')
      .attr('pointer-events','none')
      .attr("transform", (d, i) => {
        return "translate(" + (d.x+d.radius+2) + "," + (d.y-d.radius) + ")";
      })
    .merge(text)
      .text(d => d.name)
      .style('font-size', 14)
      // .style('opacity', function(d) {
      //   if (App.property.label == true || (d.isPainted && d3.schemeCategory20.indexOf(d.paintedCluster) >= 8)) {
      //     return 1;
      //   }
      //   else {
      //     return 0;
      //   }
      // })
    ;


    text.exit().remove();
  },

  clusterColor: function(cluster) {
    if (cluster === 0) {
      return '#222';
    }

    if (!this.clusterColors) {
      return d3.scaleOrdinal(d3.schemeCategory20)
        .domain(d3.range(1,20))
        (cluster);
    }

    return this.clusterColors[cluster];
  },

  findCluster: function(name) {
    var filteredData = App.panels.forceDirected.filteredData;
    for (var key in filteredData) {
      if (filteredData[key].name === name) {
        return filteredData[key].cluster;
      }
    }
    return 0;
  },

  drawLinks: function() {
    var strokeScale = d3.scaleQuantile()
      .domain(this.links.map(d => Math.abs(d.value)))
      .range(d3.range(0.4, this.links.length > 200 ? 1 : 4, 0.05));

    var mainLink = this.linkGroup.selectAll('.link-1')
      .data(this.links);

    mainLink.exit().remove();
    mainLink.enter().append('path')
        .attr('class', 'link link-1')
        .attr('fill','none')
        .attr('pointer-events','none')
      .merge(mainLink)
        .attr("value", d => d.value)
        .style("stroke-width", (d) => {
          return strokeScale(Math.abs(d.value));
        });

    // invisible line for collisions
    // var self = this;
    // var hoverLink = this.linkGroup.selectAll('.link-2')
    //   .data(this.links);
    //
    // hoverLink.exit().remove();
    // hoverLink.enter().append('path')
    //     .attr("class", "link link-2")
    //     .attr('fill','none')
    //     .attr("value", d => d.value)
    //     .style("stroke-opacity", 0)
    //     .style("stroke-width", 8)
    //     .on("mouseover", (d, i) => {
    //       if (self._isDragging) return;
    //       d3.select(d3.event.target)
    //         .style('stroke-opacity',0.5)
    //         .raise();
    //       self.showTip(d, 'path');
    //     })
    //     .on("mouseout", (d, i) => {
    //
    //       d3.select(d3.event.target)
    //         .transition()
    //         .style('stroke-opacity',0);
    //       self.hideTip();
    //     });

    this.updateEdgeVisibility();
  },

  updateEdgeVisibility: function() {
    // link visibility
    d3.selectAll('.link-1')
      .interrupt()
      .style('stroke-opacity', (d) => {
          return 1;
        // if( !App.property.green && d.value > 0 ) {
        //   return 0;
        // }
        // else if( !App.property.red && d.value < 0) {
        //   return 0;
        // }
        // else if( Math.abs(d.value) < this.visThreshold) {
        //   return 0;
        // }
        // else {
        //   return 1;
        // }
      });

    // mouseover functionality
    d3.selectAll('.link-2')
      .interrupt()
      .attr('pointer-events', (d) => {
          return 'all';
        // if( !App.property.green && d.value > 0 ) {
        //   return 'none';
        // }
        // else if( !App.property.red && d.value < 0) {
        //   return 'none';
        // }
        // else if( Math.abs(d.value) < this.visThreshold) {
        //   return 'none';
        // }
        // else {
        //   return 'all';
        // }
      });
  },

  // the big workhorse of the simulation ???
  createForceLayout: function() {
    var nodeArr = this.nodes;

    // var radiusScale = d3.scaleLinear()
    //   .domain(d3.extent(Object.keys(data), (d) => {
    //     return data[d].hits;
    //   }))
    //   .range([4, 14]);

    var borderNodeMargin = 10;

    var self = this;
    this.simulation
      .nodes(nodeArr)
      .on("tick", tick);

    // modify the appearance of the nodes and links on tick
    var node = this.nodeGroup.selectAll(".rule");
    var link = this.linkGroup.selectAll(".link");

    var cluster = this.clusterCircleGroup.selectAll(".clusterCircle");

    function tick() {
      if (self.simulation.alpha() < 0.3 && self.transform && self.transform.k < 1) { this.flagAlpha = true; }
      if (!this.flagAlpha) {
        node
          .datum((d) => {
            var clampX = d3.scaleLinear()
              .domain([16 + borderNodeMargin, self.width - 16 - borderNodeMargin])
              .range([16 + borderNodeMargin, self.width - 16 - borderNodeMargin])
              .clamp(true);

            var clampY = d3.scaleLinear()
              .domain([36 + borderNodeMargin, self.height - 36 - borderNodeMargin])
              .range([36 + borderNodeMargin, self.height - 36 - borderNodeMargin])
              .clamp(true);

            d.x = clampX(d.x);
            d.y = clampY(d.y);
            return d;
          });
      }

      node.filter('.rule-node')
          .style("fill", function(d) {
            return (d.isPainted ? 'white' :
              d.hits === 0 ? "#777777" : self.clusterColor(d.cluster));

          })
          .style("stroke", function(d) {
            return d.isPainted ? d.paintedCluster :
              (d.hits === 0 ? "#000000" :
                (d._fixed ? "#404040" : "white"));
          })
          .style("stroke-width", function(d) {
            return d.isPainted ? 3 : 1.5;
          })
          .style("stroke-opacity", function(d) {
            return d.isPainted ? 1 : 0.5;
          });

      node.attr("transform", (d,i,el) => {
            return (d3.select(el[i]).classed('rule-text')) ?
              "translate(" + (d.x+d.radius+2) + "," + (d.y-d.radius) + ")" :
              "translate(" + d.x + "," + d.y + ")";
          });

      link
        .style("stroke", (d) => {
          var dx = d.target.x - d.source.x,
              dy = d.target.y - d.source.y;
          if (d.value > 0) {
            if (Math.abs(dy/dx) > 3) {
              return dy < 0 ? "url(#greenUp)" : "url(#greenDown)";
            }
            return dx < 0 ? "url(#greenLeft)" : "url(#greenRight)";
          }
          else {
            if (Math.abs(dy/dx) > 3) {
              return dy < 0 ? "url(#redUp)" : "url(#redDown)";
            }
            return dx < 0 ? "url(#redLeft)" : "url(#redRight)";
          }
        })
        .attr('d', createArrowPath);

      self.clusterCircleGroup.selectAll(".clusterCircle")
        .attr("cx", (d) => {
          var ext = d3.extent(d, node => node.x);
          if (isNaN(ext[0])  || isNaN(ext[1])) {
              // console.log(d);
          }

          return (ext[1] + ext[0]) / 2;
        })
        .attr("cy", (d) => {
          var ext = d3.extent(d, node => node.y);
          if (isNaN(ext[0])  || isNaN(ext[1])) {
            // console.log(d);
          }

          return (ext[1] + ext[0]) / 2;
        })
        .attr("r", function(d) {

            return d.radius;
          // var x = Number(d3.select(this).attr("cx"));
          // var y = Number(d3.select(this).attr("cy"));
          //
          // var circlePadding = 15;
          //
          // var radius = d3.max(d, (node) => {
          //   return Math.sqrt(Math.pow((node.x - x), 2) + Math.pow((node.y - y), 2))
          //     + radiusScale(node.hits);
          // });
          //
          // if (isNaN(radius)) {
          //   // console.log(d);
          // }
          //
          // return radius + circlePadding;
        });
    }

    function createArrowPath(d) {
        // debugger;
      var target = nodeArr[d.target],
          source = nodeArr[d.source];

      var dx = target.x - source.x,
          dy = target.y - source.y,
          dr = Math.sqrt(dx * dx + dy * dy)*2;

      if (dr == 0) { return ""; }

      var nx = -dx / dr,
          ny = -dy / dr;

      if (dr < 100) { dr /= 2; }

      var t = {
        x: target.x + (target.radius+3)*nx,
        y: target.y + (target.radius+3)*ny
      };

      if (this.classList.contains('link-1')) {
        return  "M" + source.x + "," + source.y +
                "A" + dr + "," + dr + " 0 0,1 " +
                t.x + "," + t.y;
      }
      else {
        nx *= 8, ny *= 8;
        t.x += nx, t.y += ny;

        return  "M" + source.x + "," + source.y +
              "A" + dr + "," + dr + " 0 0,1 " +
              t.x + "," + t.y+
              "m" + (2*nx-ny) + ',' + (2*ny+nx) +
              "L" + t.x + "," + t.y+
              "l" + (2*nx+ny) + ',' + (2*ny-nx);
      }
    }


    // simulation forces
      var link_force =  d3.forceLink(this.links)
          .id(function(d) { return d.name; });


    this.simulation.force("links", link_force)
        .distance((d) => {

          let strengthScale = d3.scaleLinear()
            .domain([0, self.maxValue])
            .range([1,0.4])
            .clamp(true);

          if (d.value < 0) {
            return 25/strengthScale(-d.value);
          }
          else {
            return 25*strengthScale(d.value);
          }
        });

    this.simulation.force("cluster", clustering)
                   .force("collision", collide);


    // Initial clustering forces:
    function clustering(alpha) {
      var clusters = self.clusters;
      nodeArr.forEach(function(d) {
        if (d.cluster === 0 || (d.isPainted && d.paintedCluster === undefined)) { return; }

        var cluster = clusters[d.cluster][0];
        if (cluster === d) return;
        var x = d.x - cluster.x,
            y = d.y - cluster.y,
            l = Math.sqrt(x * x + y * y),
            r = d.radius + cluster.radius;
        if (x === 0 && y === 0 || (isNaN(x) || isNaN(y))) return;
        if (l !== r) {
          l = (l - r) / l * alpha;
          d.x -= x *= l;
          d.y -= y *= l;
          cluster.x += x;
          cluster.y += y;
        }
      });
    }

    function collide(alpha) {
      var padding = 30;
      var clusterPadding = 50; // separation between different-color circles
      var repulsion = 3;
      var maxRadius = 100;
      var quadtree = d3.quadtree()
          .x((d) => d.x)
          .y((d) => d.y)
          .addAll(nodeArr);

      nodeArr.forEach(function(d) {
        if (d.cluster === 0 || (d.isPainted && d.paintedCluster === undefined)) { return; }
        var r = d.radius + maxRadius + Math.max(padding, clusterPadding),
            nx1 = d.x - r,
            nx2 = d.x + r,
            ny1 = d.y - r,
            ny2 = d.y + r;
        quadtree.visit(function(quad, x1, y1, x2, y2) {
          if (quad.data && (quad.data !== d)) {

            var link = self.links.find(link => link.target == quad.data && link.source == d);
            if (!link) { return;}

            var x = d.x - quad.data.x,
                y = d.y - quad.data.y,
                l = Math.sqrt(x * x + y * y),
                r = d.radius + quad.data.radius;

            if (d.cluster === quad.data.cluster) {
              r += (link.value < 0) ? padding*repulsion : padding;
            }
            else {
              r += clusterPadding;
            }

            if (l < r && l > 0) {
              l = (l - r) / l * alpha;
              d.x -= x *= l;
              d.y -= y *= l;
              quad.data.x += x;
              quad.data.y += y;
            }
          }
          return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
        });
      });
    }
  }, // end createForceLayout

  // to be called externally: change the source data
  updateData: function(data) {
    if (data) { App.data = data; }

    // reprocess and cluster data
    this.oldData = this.oldData || {};
    for (var key in this.filteredData) {
      this.oldData[key] = this.filteredData[key];
    }

    this.filterData(App.data);

    var paintedClusters = [];
    for (var key in this.filteredData) {
      var d = this.filteredData[key];
      if (this.oldData[key]) {
        d.x = this.oldData[key].x;
        d.y = this.oldData[key].y;
        d.fx = this.oldData[key].fx;
        d.fy = this.oldData[key].fy;
        if (this.oldData[key].isPainted) {
          d.isPainted = true;
          d.paintedCluster = this.oldData[key].paintedCluster;
          paintedClusters.push(d);
        }
      }
      else if (App.property.pin) {
        d._fixed = true;
        d.fx = d.fx || d.x;
        d.fy = d.fy || d.y;
      }
    }
    this.paintingManager.setPaintedClusters(paintedClusters);

    this.maxValue = d3.max(this.links, d => Math.abs(d.value));
    this.defineClusters(this.threshold, 0);
    this.drawGraph();
    this.simulation.alpha(0.1).restart();
  },

  // change clustering mode between global, timestep, and window
  setClusteringMode: function(newMode) {
    this.clusterMode = newMode;
  },

  // this is a number where it will cluster around App.item +/- numTimesteps
  setWindowClusteringRange: function(numTimesteps) {
    this.windowClusteringRange = numTimesteps;
  }
}