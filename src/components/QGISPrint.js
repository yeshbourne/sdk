/*
 * Copyright 2015-present Boundless Spatial Inc., http://boundlessgeo.com
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

import React from 'react';
import ol from 'openlayers';
import LayerStore from '../stores/LayerStore';
import Button from './Button';
import classNames from 'classnames';
import Dialog from 'material-ui/Dialog';
import SelectField from 'material-ui/SelectField';
import IconMenu from 'material-ui/IconMenu';
import MenuItem from 'material-ui/MenuItem';
import JSPDF from 'jspdf';
import LinearProgress from 'material-ui/LinearProgress';
import Snackbar from 'material-ui/Snackbar';
import AppDispatcher from '../dispatchers/AppDispatcher';
import ToolUtil from '../toolutil';
import TextField from 'material-ui/TextField';
import PrintIcon from 'material-ui/svg-icons/action/print';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import getMuiTheme from 'material-ui/styles/getMuiTheme';

const messages = defineMessages({
  closebutton: {
    id: 'qgisprint.closebuttontext',
    description: 'Title of the close button',
    defaultMessage: 'Close'
  },
  modaltitle: {
    id: 'qgisprint.modaltitle',
    description: 'Title for the modal print dialog',
    defaultMessage: 'Print map'
  },
  resolutionlabel: {
    id: 'qgisprint.resolutionlabel',
    description: 'Label for the resolution combo box',
    defaultMessage: 'Resolution'
  },
  printbuttontitle: {
    id: 'qgisprint.printbuttontitle',
    description: 'Title for the print button in the modal dialog',
    defaultMessage: 'Print map'
  },
  printbuttontext: {
    id: 'qgisprint.printbuttontext',
    description: 'Text for the print button in the modal dialog',
    defaultMessage: 'Print'
  },
  printmenutext: {
    id: 'qgisprint.printmenutext',
    description: 'Text to use in the menu button that shows all possible layouts',
    defaultMessage: 'Print'
  },
  error: {
    id: 'qgisprint.error',
    description: 'Error message if PDF generation fails',
    defaultMessage: 'Error while generating PDF, details: {details}'
  }
});

const MM_PER_INCH = 25.4;
const MM_PER_POINT = 0.352777778;

/**
 * A print component which is dependent on artefacts generated by QGIS Web Application Builder.
 *
 * ```javascript
 * var printLayouts = [{
 *   name: 'Layout 1',
 *   thumbnail: 'layout1_thumbnail.png',
 *   width: 420.0,
 *   elements: [{
 *     name: 'Title',
 *     height: 40.825440467359044,
 *     width: 51.98353115727002,
 *     y: 39.25222551928783,
 *     x: 221.77507418397624,
 *     font: 'Helvetica',
 *     type: 'label',
 *     id: '24160ce7-34a3-4f25-a077-8910e4889681',
 *     size: 18
 *   }, {
 *     height: 167.0,
 *     width: 171.0,
 *     grid: {
 *       intervalX: 0.0,
 *       intervalY: 0.0,
 *       annotationEnabled: false,
 *       crs: ''
 *     },
 *     y: 19.0,
 *     x: 16.0,
 *     type: 'map',
 *     id: '3d532cb9-0eca-4e50-9f0a-ce29b1c7f5a6'
 *   }],
 *   height: 297.0
 * }];
 * ```
 *
 * ```xml
 * <QGISPrint map={map} layouts={printLayouts} />
 * ```
 */
class QGISPrint extends React.PureComponent {
  static propTypes = {
    /**
     * The ol3 map to use for printing.
     */
    map: React.PropTypes.instanceOf(ol.Map).isRequired,
    /**
     * An array of print layouts. Each layout is an object with keys such as: name (string, required),
     * thumbnail (string), width (number, required), height (number, required) and an array of elements.
     * Elements are objects with keys such as name (string, optional), type (enum('map', 'label', legend'), optional),
     * height (number, required), width (number, required), x (number, required), y (number, required), font (string),
     * id (string, required), size (number), grid (object with intervalX, intervalY, annotationEnabled and crs keys).
     */
    layouts: React.PropTypes.arrayOf(React.PropTypes.shape({
      name: React.PropTypes.string.isRequired,
      thumbnail: React.PropTypes.string,
      width: React.PropTypes.number.isRequired,
      elements: React.PropTypes.arrayOf(React.PropTypes.shape({
        name: React.PropTypes.string,
        type: React.PropTypes.oneOf(['map', 'label', 'legend']),
        height: React.PropTypes.number.isRequired,
        width: React.PropTypes.number.isRequired,
        x: React.PropTypes.number.isRequired,
        y: React.PropTypes.number.isRequired,
        font: React.PropTypes.string,
        id: React.PropTypes.string.isRequired,
        size: React.PropTypes.number,
        grid: React.PropTypes.shape({
          intervalX: React.PropTypes.number.isRequired,
          intervalY: React.PropTypes.number.isRequired,
          annotationEnabled: React.PropTypes.bool.isRequired,
          crs: React.PropTypes.string.isRequired
        })
      })).isRequired,
      height: React.PropTypes.number.isRequired
    })).isRequired,
    /**
     * A list of resolutions from which the user can choose from. Please note that artefacts for all resolutions need to get pre-generated by QGIS.
     */
    resolutions: React.PropTypes.array,
    /**
     * The relative path where thumbnails of the print layouts can be found. Thumbnails are also generated by QGIS.
     */
    thumbnailPath: React.PropTypes.string,
    /**
     * Css class name to apply on the root element of this component.
     */
    className: React.PropTypes.string,
    /**
     * Style config object for IconMenu.
     */
    style: React.PropTypes.object,
    /**
     * Should we display as a menu? If not, we display as a button but there can only be 1 print layout then.
     */
    menu: React.PropTypes.bool,
    /**
     * @ignore
     */
    intl: intlShape.isRequired
  };

  static contextTypes = {
    muiTheme: React.PropTypes.object
  };

  static childContextTypes = {
    muiTheme: React.PropTypes.object.isRequired
  };

  static defaultProps = {
    menu: true,
    thumbnailPath: '../../resources/print/',
    resolutions: [72, 150]
  };

  constructor(props, context) {
    super(props);
    this._dispatchToken = ToolUtil.register(this);
    this._muiTheme = context.muiTheme || getMuiTheme();
    LayerStore.bindMap(this.props.map);
    this.state = {
      disabled: false,
      layout: null,
      layoutName: null,
      loading: false,
      error: false,
      open: false,
      errorOpen: false,
      resolution: null
    };
  }
  componentWillUnmount() {
    AppDispatcher.unregister(this._dispatchToken);
  }
  getChildContext() {
    return {muiTheme: this._muiTheme};
  }
  close() {
    this.setState({
      open: false
    });
  }
  _onClick(layout, event) {
    this.setState({open: true, layoutName: layout.name, layout: layout});
  }
  _onPrintButtonClick() {
    var layout = this.props.layouts[0];
    this.setState({open: true, layoutName: layout.name, layout: layout});
  }
  _elementLoaded() {
    this._elementsLoaded++;
    if (this._elementsLoaded === this.state.layout.elements.length) {
      this._pdf.save('map.pdf');
      this.setState({loading: false});
    }
  }
  _getTileLayers() {
    var state = LayerStore.getState();
    var tileLayers = [];
    for (var i = 0, ii = state.flatLayers.length; i < ii; ++i) {
      var layer = state.flatLayers[i];
      if (layer instanceof ol.layer.Tile && layer.getVisible()) {
        tileLayers.push(layer);
      }
    }
    return tileLayers;
  }
  _tileLayerLoaded() {
    this._tiledLayersLoaded++;
    if (this._tiledLayersLoaded === this._tileLayers.length) {
      var me = this;
      global.setTimeout(function() {
        me._paintMapInPdf();
      }, 1000);
    }
  }
  _paintMapInPdf() {
    var data, error;
    try {
      data = this._canvas.toDataURL('image/jpeg');
    } catch (e) {
      error = true;
      this.setState({loading: false, errorOpen: true, error: true, msg: e});
    }
    var map = this.props.map;
    if (error !== true) {
      var pdf = this._pdf;
      var mapElement = this._mapElement;
      pdf.rect(mapElement.x, mapElement.y, mapElement.width, mapElement.height);
      pdf.addImage(data, 'jpeg', mapElement.x, mapElement.y, mapElement.width, mapElement.height);
    }
    map.setSize(this._origSize);
    map.getView().fit(this._origExtent, this._origSize, {constrainResolution: false});
    map.renderSync();
    this._elementLoaded();
  }
  _onResolutionChange(evt, idx, value) {
    this.setState({resolution: value});
  }
  _loadStart(evt) {
    var idx = this._sources.indexOf(evt.target);
    this._loading[idx]++;
  }
  _loadEndError(evt) {
    var idx = this._sources.indexOf(evt.target);
    ++this._loaded[idx];
    if (this._loading[idx] === this._loaded[idx]) {
      this._tileLayerLoaded();
      this._removeLoadListeners(idx);
    }
  }
  _attachLoadListeners(idx) {
    this._sources[idx] = this._tileLayers[idx].getSource();
    this._loading[idx] = 0;
    this._loaded[idx] = 0;
    var source = this._sources[idx];
    source.on('tileloadstart', this._loadStart, this);
    source.on('tileloadend', this._loadEndError, this);
    source.on('tileloaderror', this._loadEndError, this);
    var me = this;
    global.setTimeout(function() {
      if (me._loading[idx] === me._loaded[idx]) {
        me._tileLayerLoaded();
        me._removeLoadListeners(idx);
      }
    }, 1000);
  }
  _removeLoadListeners(idx) {
    var source = this._sources[idx];
    source.un('tileloadstart', this._loadStart, this);
    source.un('tileloadend', this._loadEndError, this);
    source.un('tileloaderror', this._loadEndError, this);
  }
  _addImage(el, resolution) {
    var type = el.type;
    this._images[el.id] = new Image();
    this._images[el.id].crossOrigin = 'anonymous';
    var me = this;
    this._images[el.id].addEventListener('error', function() {
      me._elementLoaded();
    });
    this._images[el.id].addEventListener('load', function() {
      me._pdf.addImage(me._images[el.id], 'png', el.x, el.y, el.width, el.height);
      me._elementLoaded();
    });
    this._images[el.id].src = (type === 'picture') ? this.props.thumbnailPath + el.file :
      this.props.thumbnailPath + this._layoutSafeName + '_' + el.id + '_' + resolution + '.png';
  }
  _createMap(labels) {
    var map = this.props.map;
    var resolution = this.state.resolution;
    if (resolution === null) {
      return;
    }
    var layout = this.state.layout;
    this._layoutSafeName = layout.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
    var elements = layout.elements;
    var orientation = (layout.width > layout.height) ? 'landscape' : 'portrait';
    this._pdf = new JSPDF(orientation, 'mm', [layout.width, layout.height]);
    this._images = [];
    this._elementsLoaded = 0;
    var size = (map.getSize());
    var extent = map.getView().calculateExtent(size);
    this._tileLayers = this._getTileLayers();
    this._tiledLayersLoaded = 0;
    var postCompose = function(event) {
      this._canvas = event.context.canvas;
      this._sources = [];
      this._loaded = [];
      this._loading = [];
      for (var j = 0, jj = this._tileLayers.length; j < jj; j++) {
        this._attachLoadListeners(j);
      }
    };
    for (var i = 0; i < elements.length; i++) {
      var element = elements[i];
      if (element.type === 'label') {
        this._pdf.setFontSize(element.size);
        this._pdf.text(element.x, element.y + element.size * MM_PER_POINT, labels[element.name]);
        this._elementLoaded();
      } else if (element.type === 'map') {
        this._mapElement = element;
        var width = Math.round(element.width * resolution / MM_PER_INCH);
        var height = Math.round(element.height * resolution / MM_PER_INCH);
        map.once('postcompose', postCompose, this);
        this._origSize = map.getSize();
        this._origExtent = map.getView().calculateExtent(this._origSize);
        map.setSize([width, height]);
        map.getView().fit(extent, map.getSize(), {constrainResolution: false});
        map.renderSync();
        if (this._tileLayers.length === 0) {
          this._paintMapInPdf();
        }
      } else if (element.type === 'picture' || element.type === 'shape' || element.type === 'arrow' ||
        element.type === 'legend' || element.type === 'scalebar') {
        this._addImage(element, resolution);
      } else {
        this._elementLoaded();
      }
    }
  }
  _print() {
    this.setState({
      loading: true
    });
    var elements = this.state.layout.elements;
    var labels = {};
    for (var i = 0, ii = elements.length; i < ii; i++) {
      if (elements[i].type === 'label') {
        var name = elements[i].name;
        labels[name] = this.refs[name].getValue();
      }
    }
    this._createMap(labels);
  }
  _handleRequestClose() {
    this.setState({
      errorOpen: false
    });
  }
  disable() {
    this.setState({disabled: true});
  }
  enable() {
    this.setState({disabled: false});
  }
  render() {
    const {formatMessage} = this.props.intl;
    var listitems = this.props.layouts.map(function(lyt, idx) {
      var thumbnail;
      if (lyt.thumbnail) {
        thumbnail = (<img src={this.props.thumbnailPath + lyt.thumbnail}/>);
      }
      return (<MenuItem onTouchTap={this._onClick.bind(this, lyt)} key={idx} value={lyt.name} primaryText={lyt.name}><div>{thumbnail}</div></MenuItem>);
    }, this);
    var dialog, layout = this.state.layout;
    if (layout !== null) {
      var elements;
      for (var i = 0, ii = layout.elements.length; i < ii; ++i) {
        var element = layout.elements[i];
        if (element.type === 'label') {
          if (elements === undefined) {
            elements = [];
          }
          elements.push(<TextField floatingLabelText={element.name} key={element.name} ref={element.name} />);
        }
      }
      var selectOptions = this.props.resolutions.map(function(resolution) {
        return (<MenuItem key={resolution} value={resolution} primaryText={resolution + ' dpi'} />);
      });
      var loading, error;
      if (this.state.error) {
        error = (<Snackbar
          open={this.state.errorOpen}
          style={{transitionProperty : 'none'}}
          message={formatMessage(messages.error, {details: this.state.msg})}
          autoHideDuration={2000}
          onRequestClose={this._handleRequestClose.bind(this)}
        />);
      }
      if (this.state.loading === true) {
        loading = (<LinearProgress mode="indeterminate"/>);
      }
      var actions = [
        <Button buttonType='Flat' label={formatMessage(messages.printbuttontext)} onTouchTap={this._print.bind(this)} />,
        <Button buttonType='Flat' label={formatMessage(messages.closebutton)} onTouchTap={this.close.bind(this)} />
      ];
      dialog = (
        <Dialog actions={actions} title={formatMessage(messages.modaltitle)} modal={true} open={this.state.open} onRequestClose={this.close.bind(this)}>
          {elements}
          <br/>
          <SelectField floatingLabelText={formatMessage(messages.resolutionlabel)} value={this.state.resolution} onChange={this._onResolutionChange.bind(this)}>
            {selectOptions}
          </SelectField>
          {loading}
          {error}
        </Dialog>
      );
    }
    if (this.props.menu === false) {
      return (
        <span className={classNames('sdk-component qgis-print', this.props.className)}>
          <Button disabled={this.state.disabled} onTouchTap={this._onPrintButtonClick.bind(this)} tooltip={formatMessage(messages.printbuttontitle)} mini={true} buttonType='Action'><PrintIcon/></Button>
          {dialog}
        </span>
      );
    } else {
      return (
        <span className={classNames('sdk-component qgis-print', this.props.className)}>
          <IconMenu anchorOrigin={{horizontal: 'left', vertical: 'top'}} targetOrigin={{horizontal: 'left', vertical: 'top'}} iconButtonElement={<Button disabled={this.state.disabled} label={formatMessage(messages.printmenutext)} />} value={this.state.layoutName}>
            {listitems}
          </IconMenu>
          {dialog}
        </span>
      );
    }
  }
}

export default injectIntl(QGISPrint);
