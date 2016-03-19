/**
 * @classdesc
 * A layer used to display tiled map services, such as [google maps]{@link http://maps.google.com}, [open street maps]{@link http://www.osm.org}
 * @class
 * @category layer
 * @extends maptalks.Layer
 * @param {String|Number} id - tile layer's id
 * @param {Object} [options=null] - construct options
 * @param {Boolean} [options.debug=false] - whether the geometries on the layer is in debug mode.
 * @param {*} options.* - any other option defined in [maptalks.Layer]{@link maptalks.Layer#options}
 */
Z.TileLayer = Z.Layer.extend(/** @lends maptalks.TileLayer.prototype */{

    options: {
        'errorTileUrl'  : 'images/system/transparent.png',
        'urlTemplate'   : 'images/system/transparent.png',
        'subdomains'    : null,

        'gradualLoading' : true,

        'repeatWorld'   : true,

        'renderWhenPanning' : false,
        //移图时地图的更新间隔, 默认为0即实时更新, -1表示不更新.如果效率较慢则可改为适当的值
        'renderSpanWhenPanning' : 0,

        'crossOrigin' : null,

        'tileSize' : {
            'width'   : 256,
            'height'  : 256
        },

        'tileSystem' : null,

        'renderer'  : 'canvas'
    },


    initialize:function(id,opts) {
        this.setId(id);
        Z.Util.setOptions(this,opts);
    },

    /**
     * Get tile size of the tile layer
     * @return {maptalks.Size}
     */
    getTileSize:function() {
        return Z.Util.extend({}, this.options['tileSize']);
    },

    /**
     * Clear the layer
     * @return {maptalks.TileLayer} this
     */
    clear:function() {
        if (this._renderer) {
            this._renderer.clear();
        }
        return this;
    },

    /**
     * initialize [tileConfig]{@link maptalks.TileConfig} for the tilelayer
     * @private
     */
    _initTileConfig:function() {
        var map = this.getMap();
        this._defaultTileConfig = new Z.TileConfig(Z.TileSystem.getDefault(map.getProjection()), map.getFullExtent(), this.getTileSize());
        if (this.options['tileSystem']) {
            this._tileConfig = new Z.TileConfig(this.options['tileSystem'], map.getFullExtent(), this.getTileSize());
        }
    },

    _getTileConfig:function(){
        if (!this._defaultTileConfig) {
            this._initTileConfig();
        }
        var tileConfig = this._tileConfig;
        if (tileConfig) {return tileConfig;}
        var map = this.getMap();
        //inherit baselayer's tileconfig
        if (map && map.getBaseLayer() && map.getBaseLayer()._getTileConfig) {
            return map.getBaseLayer()._getTileConfig();
        }
        return this._defaultTileConfig;
    },

    _getTiles:function(canvasSize) {
        // rendWhenReady = false;
        var map =this.getMap();
        if (!map) {
            return null;
        }
        if (!this.isVisible()) {
            return null;
        }

        var tileConfig = this._getTileConfig();
        if (!tileConfig) {return null;}

        var tileSize = this.getTileSize(),
            zoom = map.getZoom(),
            res = map._getResolution(),
            mapDomOffset = map.offsetPlatform();

        var holderLeft=mapDomOffset.x,
            holderTop = mapDomOffset.y,
            mapWidth = map.width,
            mapHeight = map.height;
            //中心瓦片信息,包括瓦片编号,和中心点在瓦片上相对左上角的位置
        var centerTileIndex =  tileConfig.getCenterTileIndex(map._getPrjCenter(), res);
        //计算中心瓦片的top和left偏移值
        var centerTileViewPoint=new Z.Point(parseFloat(mapWidth/2-centerTileIndex["offsetLeft"]),
                                                parseFloat(mapHeight/2-centerTileIndex["offsetTop"])).round();
        if (!canvasSize || !(canvasSize instanceof Z.Size)) {
            canvasSize = new Z.Size(mapWidth, mapHeight);
        }
        //中心瓦片上下左右的瓦片数
        var tileTopNum =Math.ceil(Math.abs((canvasSize['height'] - mapHeight)/2 + centerTileViewPoint.y)/tileSize["height"]),
            tileLeftNum=Math.ceil(Math.abs((canvasSize['width']- mapWidth)/2 + centerTileViewPoint.x)/tileSize["width"]),
            tileBottomNum=Math.ceil(Math.abs((canvasSize['height'] - mapHeight)/2 + mapHeight-centerTileViewPoint.y)/tileSize["height"]),
            tileRightNum=Math.ceil(Math.abs((canvasSize['width'] - mapWidth)/2 + mapWidth-centerTileViewPoint.x)/tileSize["width"]);

    //  只加中心的瓦片，用做调试
    //  var centerTileImg = this._createTileImage(centerTileViewPoint.x,centerTileViewPoint.y,this.config._getTileUrl(centerTileIndex["topIndex"],centerTileIndex["leftIndex"],zoom),tileSize["height"],tileSize["width"]);
    //  tileContainer.appendChild(centerTileImg);

        var tiles = [];
        var fullExtent = new Z.PointExtent();
        //TODO 瓦片从中心开始加起
        for (var i=-(tileLeftNum);i<tileRightNum;i++){
            for (var j=-(tileTopNum);j<=tileBottomNum;j++){
                    var tileIndex = tileConfig.getNeighorTileIndex(centerTileIndex["y"], centerTileIndex["x"], j,i, res, this.options['repeatWorld']);
                    var tileLeft = centerTileViewPoint.x + tileSize["width"]*i-holderLeft;
                    var tileTop = centerTileViewPoint.y +tileSize["height"]*j-holderTop;
                    var tileUrl = this._getTileUrl(tileIndex["x"],tileIndex["y"],zoom);
                    var tileId=[tileIndex["y"], tileIndex["x"], zoom].join('__');
                    var tileDesc = {
                        'url' : tileUrl,
                        'viewPoint': new Z.Point(tileLeft, tileTop),
                        'id'  : tileId,
                        'zoom' : zoom
                    };
                    tiles.push(tileDesc);
                    fullExtent = fullExtent.combine(new Z.PointExtent(tileDesc['viewPoint'], tileDesc['viewPoint'].add(new Z.Point(tileSize['width'],tileSize['height']))));
            }
        }
        var sortOrder = 1;
        if (Z.Browser.ie || Z.Browser.edge) {
            sortOrder = -1;
        }
        //瓦片排序, 地图中心的瓦片排在末尾, 末尾的瓦片先载入
        tiles.sort(function (a, b) {
            return sortOrder*(b['viewPoint'].distanceTo(centerTileViewPoint)-a['viewPoint'].distanceTo(centerTileViewPoint));
        });
        return {
            'tiles' : tiles,
            'fullExtent' : fullExtent
        };
    },

    _getTileUrl:function(x,y,z) {
        if (!this.options['urlTemplate']) {
            return this.options['errorTileUrl'];
        }
        var urlTemplate = this.options['urlTemplate'];
        if (Z.Util.isFunction(urlTemplate)) {
            return urlTemplate(x,y,z);
        }
        var domain = '';
        if (this.options['subdomains']) {
            var subdomains = this.options['subdomains'];
            if (Z.Util.isArrayHasData(subdomains)) {
                var length = subdomains.length;
                var s = (x+y) % length;
                if (s<0) {
                    s=0;
                }
                domain = subdomains[s];
            }
        }
        var data = {
            'x' : x,
            'y' : y,
            'z' : z,
            's' : domain
        };
        return urlTemplate.replace(/\{ *([\w_]+) *\}/g,function (str, key) {
            var value = data[key];

            if (value === undefined) {
                throw new Error('No value provided for variable ' + str);

            } else if (typeof value === 'function') {
                value = value(data);
            }
            return value;
        });
    }
});

/**
 * Export the tile layer's profile json. <br>
 * Layer's profile is a snapshot of the layer in JSON format. <br>
 * It can be used to reproduce the instance by [fromJSON]{@link maptalks.Layer#fromJSON} method
 * @return {Object} layer's profile JSON
 */
Z.TileLayer.prototype.toJSON=function() {
    var profile = {
        "type":'TileLayer',
        "id":this.getId(),
        "options" : this.config()
    };
    return profile;
}

/**
 * Reproduce a TileLayer from layer's profile JSON.
 * @param  {Object} layerJSON - layer's profile JSON
 * @return {maptalks.TileLayer}
 * @static
 * @private
 * @function
 */
Z.TileLayer._fromJSON=function(layerJSON) {
    if (!layerJSON || layerJSON['type'] !== 'TileLayer') {return null;}
    return new Z.TileLayer(layerJSON['id'], layerJSON['options']);
}

Z.Util.extend(Z.TileLayer,Z.Renderable);
