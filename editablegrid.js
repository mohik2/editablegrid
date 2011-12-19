if (typeof _$ == 'undefined') {
	function _$(elementId) { return document.getElementById(elementId); }
}

/**
 * Creates a new column
 * @constructor
 * @class Represents a column in the editable grid
 * @param {Object} config
 */
function Column(config)
{
	// default properties
	var props = {
			name: "",
			label: "",
			editable: true,
			renderable: true,
			datatype: "string",
			unit: null,
			precision: -1, // means that all decimals are displayed
			nansymbol: '',
			decimal_point: ',',
			thousands_separator: '.',
			unit_before_number: false,
			bar: true, // is the column to be displayed in a bar chart ? relevant only for numerical columns 
			headerRenderer: null,
			headerEditor: null,
			cellRenderer: null,
			cellEditor: null,
			cellValidators: [],
			enumProvider: null,
			optionValues: null,
			columnIndex: -1
	};

	// override default properties with the ones given
	for (var p in props) this[p] = (typeof config == 'undefined' || typeof config[p] == 'undefined') ? props[p] : config[p];
}

Column.prototype.getOptionValuesForRender = function(rowIndex) { 
	var values = this.enumProvider.getOptionValuesForRender(this.editablegrid, this, rowIndex);
	return values ? values : this.optionValues;
};

Column.prototype.getOptionValuesForEdit = function(rowIndex) { 
	var values = this.enumProvider.getOptionValuesForEdit(this.editablegrid, this, rowIndex);
	return values ? values : this.optionValues;
};

Column.prototype.isValid = function(value) {
	for (var i = 0; i < this.cellValidators.length; i++) if (!this.cellValidators[i].isValid(value)) return false;
	return true;
};

Column.prototype.isNumerical = function() {
	return this.datatype =='double' || this.datatype =='integer';
};

/**
 * Creates a new enumeration provider 
 * @constructor
 * @class Base class for all enumeration providers
 * @param {Object} config
 */
function EnumProvider(config)
{
	// default properties
	this.getOptionValuesForRender = function(grid, column, rowIndex) { return null; };
	this.getOptionValuesForEdit = function(grid, column, rowIndex) { return null; };

	// override default properties with the ones given
	for (var p in config) this[p] = config[p];
}

/**
 * Creates a new EditableGrid.
 * <p>You can specify here some configuration options (optional).
 * <br/>You can also set these same configuration options afterwards.
 * <p>These options are:
 * <ul>
 * <li>enableSort: enable sorting when clicking on column headers (default=true)</li>
 * <li>doubleclick: use double click to edit cells (default=false)</li>
 * <li>editmode: can be one of
 * <ul>
 * 		<li>absolute: cell editor comes over the cell (default)</li>
 * 		<li>static: cell editor comes inside the cell</li>
 * 		<li>fixed: cell editor comes in an external div</li>
 * </ul>
 * </li>
 * <li>editorzoneid: used only when editmode is set to fixed, it is the id of the div to use for cell editors</li>
 * <li>allowSimultaneousEdition: tells if several cells can be edited at the same time (default=false)<br/>
 * Warning: on some Linux browsers (eg. Epiphany), a blur event is sent when the user clicks on a 'select' input to expand it.
 * So practically, in these browsers you should set allowSimultaneousEdition to true if you want to use columns with option values and/or enum providers.
 * This also used to happen in older versions of Google Chrome Linux but it has been fixed, so upgrade if needed.</li>
 * <li>saveOnBlur: should be cells saved when clicking elsewhere ? (default=true)</li>
 * <li>invalidClassName: CSS class to apply to text fields when the entered value is invalid (default="invalid")</li>
 * <li>ignoreLastRow: ignore last row when sorting and charting the data (typically for a 'total' row)</li>
 * <li>caption: text to use as the grid's caption</li>
 * <li>dateFormat: EU or US (default="EU")</li>
 * <li>shortMonthNames: list of month names (default=["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])</li>
 * <li>smartColorsBar: colors used for rendering (stacked) bar charts</li>
 * <li>smartColorsPie: colors used for rendering pie charts</li>
 * <li>pageSize: maximum number of rows displayed (0 means we don't want any pagination, which is the default)</li>
 * </ul>
 * @constructor
 * @class EditableGrid
 */
function EditableGrid(name, config) { if (name) this.init(name, config); }

EditableGrid.prototype.init = function (name, config)
{
	if (typeof name != "string" || (typeof config != "object" && typeof config != "undefined")) {
		alert("The EditableGrid constructor takes two arguments:\n- name (string)\n- config (object)\n\nGot instead " + (typeof name) + " and " + (typeof config) + ".");
	};

	// default properties
	var props = 
	{
			enableSort: true,
			doubleclick: false,
			editmode: "absolute",
			editorzoneid: "",
			allowSimultaneousEdition: false,
			saveOnBlur: true,
			invalidClassName: "invalid",
			ignoreLastRow: false,
			caption: null,
			dateFormat: "EU",
			shortMonthNames: null,
			smartColorsBar: ["#dc243c","#4040f6","#00f629","#efe100","#f93fb1","#6f8183","#111111"],
			smartColorsPie: ["#FF0000","#00FF00","#0000FF","#FFD700","#FF00FF","#00FFFF","#800080"],
			pageSize: 0
	};

	// override default properties with the ones given
	for (var p in props) this[p] = props[p];
	if (typeof config != 'undefined') for (var p in config) this[p] = config[p];
	
	this.Browser = {
			IE:  !!(window.attachEvent && navigator.userAgent.indexOf('Opera') === -1),
			Opera: navigator.userAgent.indexOf('Opera') > -1,
			WebKit: navigator.userAgent.indexOf('AppleWebKit/') > -1,
			Gecko: navigator.userAgent.indexOf('Gecko') > -1 && navigator.userAgent.indexOf('KHTML') === -1,
			MobileSafari: !!navigator.userAgent.match(/Apple.*Mobile.*Safari/)
	};

	// private data
	this.name = name;
	this.columns = [];
	this.data = [];
	this.dataUnfiltered = null; // non null means that data is filtered
	this.xmlDoc = null;
	this.sortedColumnName = -1;
	this.sortDescending = false;
	this.baseUrl = this.detectDir();
	this.nbHeaderRows = 1;
	this.lastSelectedRowIndex = -1;
	this.currentPageIndex = 0;
	this.currentFilter = null;
	this.currentContainerid = null; 
	this.currentClassName = null; 
	this.currentTableid = null;

	if (this.enableSort) {
		this.sortUpImage = new Image();
		this.sortUpImage.src = this.baseUrl + "/images/bullet_arrow_up.png";
		this.sortDownImage = new Image();
		this.sortDownImage.src = this.baseUrl + "/images/bullet_arrow_down.png";
	}
};

/**
 * Callback functions
 */

EditableGrid.prototype.tableLoaded = function() {};
EditableGrid.prototype.chartRendered = function() {};
EditableGrid.prototype.tableRendered = function(containerid, className, tableid) {};
EditableGrid.prototype.tableSorted = function(columnIndex, descending) {};
EditableGrid.prototype.tableFiltered = function() {};
EditableGrid.prototype.modelChanged = function(rowIndex, columnIndex, oldValue, newValue, row) {};
EditableGrid.prototype.rowSelected = function(oldRowIndex, newRowIndex) {};
EditableGrid.prototype.isHeaderEditable = function(rowIndex, columnIndex) { return false; };
EditableGrid.prototype.isEditable =function(rowIndex, columnIndex) { return true; };
EditableGrid.prototype.readonlyWarning = function() {};

/**
 * Load metadata and data from an XML url
 */
EditableGrid.prototype.loadXML = function(url)
{
	// we use a trick to avoid getting an old version from the browser's cache
	var orig_url = url;
	var sep = url.indexOf('?') >= 0 ? '&' : '?'; 
	url += sep + Math.floor(Math.random() * 100000);

	with (this) {

		// IE
		if (window.ActiveXObject) 
		{
			xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
			xmlDoc.onreadystatechange = function() {
				if (xmlDoc.readyState == 4) {
					processXML();
					tableLoaded();
				}
			};
			xmlDoc.load(url);
		}

		// Safari
		else if (/*Browser.WebKit && */ window.XMLHttpRequest) 
		{
			xmlDoc = new XMLHttpRequest();
			xmlDoc.onreadystatechange = function () {
				if (xmlDoc.readyState == 4) {
					xmlDoc = xmlDoc.responseXML;
					if (!xmlDoc) { /* alert("Could not load XML from url '" + orig_url + "'"); */ return false; }
					processXML();
					tableLoaded();
				}
			};
			xmlDoc.open("GET", url, true);
			xmlDoc.send("");
		}

		// Firefox (and other browsers) 
		else if (document.implementation && document.implementation.createDocument) 
		{
			xmlDoc = document.implementation.createDocument("", "", null);
			xmlDoc.onload = function() {
				processXML();
				tableLoaded();
			};
			xmlDoc.load(url);
		}

		// should never happen
		else { 
			alert("Cannot load XML file with this browser!"); 
			return false;
		}

		return true;
	}
};

/**
 * Process the XML content
 * @private
 */
EditableGrid.prototype.processXML = function()
{
	with (this) {

		// clear model and pointer to current table
		this.columns = [];
		this.data = [];
		this.dataUnfiltered = null;
		this.table = null;

		// load metadata (only one tag <metadata> --> metadata[0])
		var metadata = xmlDoc.getElementsByTagName("metadata");
		if (!metadata || metadata.length < 1) return false;
		var columnDeclarations = metadata[0].getElementsByTagName("column");
		for (var i = 0; i < columnDeclarations.length; i++) {

			// get column type
			var col = columnDeclarations[i];
			var datatype = col.getAttribute("datatype");

			// get enumerated values if any
			var optionValues = null;
			var enumValues = col.getElementsByTagName("values");
			if (enumValues.length > 0) {
				optionValues = {};

				var enumGroups = enumValues[0].getElementsByTagName("group");
				if (enumGroups.length > 0) {
					for (var g = 0; g < enumGroups.length; g++) {
						var groupOptionValues = {};
						enumValues = enumGroups[g].getElementsByTagName("value");
						for (var v = 0; v < enumValues.length; v++) {
							groupOptionValues[enumValues[v].getAttribute("value")] = enumValues[v].firstChild ? enumValues[v].firstChild.nodeValue : "";
						}
						optionValues[enumGroups[g].getAttribute("label")] = groupOptionValues;
					}
				}
				else {
					enumValues = enumValues[0].getElementsByTagName("value");
					for (var v = 0; v < enumValues.length; v++) {
						optionValues[enumValues[v].getAttribute("value")] = enumValues[v].firstChild ? enumValues[v].firstChild.nodeValue : "";
					}
				}
			}

			// create new column           
			var column = new Column({
				name: col.getAttribute("name"),
				label: typeof col.getAttribute("label") == 'string' ? col.getAttribute("label") : col.getAttribute("name"),
						datatype: col.getAttribute("datatype") ? col.getAttribute("datatype") : "string",
								editable : col.getAttribute("editable") == "true",
								bar : col.getAttribute("bar") ? col.getAttribute("bar") == "true" : true,
										optionValues: optionValues,
										enumProvider: (optionValues ? new EnumProvider() : null),
										columnIndex: i
			});

			// parse column type
			parseColumnType(column);

			// create suited cell renderer
			_createCellRenderer(column);
			_createHeaderRenderer(column);

			// create suited cell editor
			_createCellEditor(column);  
			_createHeaderEditor(column);

			// add default cell validators based on the column type
			_addDefaultCellValidators(column);

			// add column
			column.editablegrid = this;
			columns.push(column);
		}

		// load content
		var rows = xmlDoc.getElementsByTagName("row");
		for (var i = 0; i < rows.length; i++) 
		{
			// get all defined cell values
			var cellValues = {};
			var cols = rows[i].getElementsByTagName("column");
			for (var j = 0; j < cols.length; j++) {
				var colname = cols[j].getAttribute("name");
				if (!colname) {
					if (j >= columns.length) alert("You defined too many columns for row " + (i+1));
					else colname = columns[j].name; 
				}
				cellValues[colname] = cols[j].firstChild ? cols[j].firstChild.nodeValue : "";
			}

			// for each row we keep the orginal index, the id and all other attributes that may have been set in the XML
			var rowData = { visible: true, originalIndex: i, id: rows[i].getAttribute("id") ? rows[i].getAttribute("id") : "" };  
			for (var attrIndex = 0; attrIndex < rows[i].attributes.length; attrIndex++) {
				var node = rows[i].attributes.item(attrIndex);
				if (node.nodeName != "id") rowData[node.nodeName] = node.nodeValue; 
			}

			// get column values for this rows
			rowData.columns = [];
			for (var c = 0; c < columns.length; c++) {
				var cellValue = columns[c].name in cellValues ? cellValues[columns[c].name] : "";
				rowData.columns.push(getTypedValue(c, cellValue));
			}

			// add row data in our model
			data.push(rowData);
		}
	}
};

/**
 * Parse column type
 * @private
 */

EditableGrid.prototype.parseColumnType = function(column)
{
	// extract precision, unit and number format from type if 6 given
	if (column.datatype.match(/(.*)\((.*),(.*),(.*),(.*),(.*),(.*)\)$/)) {
		column.datatype = RegExp.$1;
		column.unit = RegExp.$2;
		column.precision = parseInt(RegExp.$3);
		column.decimal_point = RegExp.$4;
		column.thousands_separator = RegExp.$5;
		column.unit_before_number = RegExp.$6;
		column.nansymbol = RegExp.$7;

		// trim should be done after fetching RegExp matches beacuse it itself uses a RegExp and causes interferences!
		column.unit = column.unit.trim();
		column.decimal_point = column.decimal_point.trim();
		column.thousands_separator = column.thousands_separator.trim();
		column.unit_before_number = column.unit_before_number.trim() == '1';
		column.nansymbol = column.nansymbol.trim();
	}

	// extract precision, unit and number format from type if 5 given
	else if (column.datatype.match(/(.*)\((.*),(.*),(.*),(.*),(.*)\)$/)) {
		column.datatype = RegExp.$1;
		column.unit = RegExp.$2;
		column.precision = parseInt(RegExp.$3);
		column.decimal_point = RegExp.$4;
		column.thousands_separator = RegExp.$5;
		column.unit_before_number = RegExp.$6;

		// trim should be done after fetching RegExp matches beacuse it itself uses a RegExp and causes interferences!
		column.unit = column.unit.trim();
		column.decimal_point = column.decimal_point.trim();
		column.thousands_separator = column.thousands_separator.trim();
		column.unit_before_number = column.unit_before_number.trim() == '1';
	}

	// extract precision, unit and nansymbol from type if 3 given
	else if (column.datatype.match(/(.*)\((.*),(.*),(.*)\)$/)) {
		column.datatype = RegExp.$1;
		column.unit = RegExp.$2.trim();
		column.precision = parseInt(RegExp.$3);
		column.nansymbol = RegExp.$4.trim();
	}

	// extract precision and unit from type if two given
	else if (column.datatype.match(/(.*)\((.*),(.*)\)$/)) {
		column.datatype = RegExp.$1.trim();
		column.unit = RegExp.$2.trim();
		column.precision = parseInt(RegExp.$3);
	}

	// extract precision or unit from type if any given
	else if (column.datatype.match(/(.*)\((.*)\)$/)) {
		column.datatype = RegExp.$1.trim();
		var unit_or_precision = RegExp.$2.trim();
		if (unit_or_precision.match(/^[0-9]*$/)) column.precision = parseInt(unit_or_precision);
		else column.unit = unit_or_precision;
	}

	if (column.decimal_point == 'comma') column.decimal_point = ',';
	if (column.decimal_point == 'dot') column.decimal_point = '.';
	if (column.thousands_separator == 'comma') column.thousands_separator = ',';
	if (column.thousands_separator == 'dot') column.thousands_separator = '.';

	if (isNaN(column.precision)) column.precision = null;
	if (column.unit == '') column.unit = null;
	if (column.nansymbol == '') column.nansymbol = null;
};

/**
 * Get typed value
 * @private
 */

EditableGrid.prototype.getTypedValue = function(columnIndex, cellValue) 
{
	var colType = this.getColumnType(columnIndex);
	if (colType == 'boolean') cellValue = (cellValue && cellValue != 0 && cellValue != "false") ? true : false;
	if (colType == 'integer') { cellValue = parseInt(cellValue); } 
	if (colType == 'double') { cellValue = parseFloat(cellValue); }
	if (colType == 'string') { cellValue = "" + cellValue; }
	return cellValue;
};

/**
 * Attach to an existing HTML table, using given column definitions
 */
EditableGrid.prototype.attachToHTMLTable = function(_table, _columns)
{
	with (this) {

		// clear model and pointer to current table
		this.columns = [];
		this.data = [];
		this.dataUnfiltered = null;
		this.table = null;

		// we have our new columns
		columns = _columns;
		for (var c = 0; c < columns.length; c++) {

			// set column index and back pointer
			var column = columns[c];
			column.editablegrid = this;
			column.columnIndex = c;

			// parse column type
			parseColumnType(column);

			// create suited enum provider, renderer and editor if none given
			if (!column.enumProvider) column.enumProvider = column.optionValues ? new EnumProvider() : null;
			if (!column.cellRenderer) _createCellRenderer(column);
			if (!column.headerRenderer) _createHeaderRenderer(column);
			if (!column.cellEditor) _createCellEditor(column);  
			if (!column.headerEditor) _createHeaderEditor(column);

			// add default cell validators based on the column type
			_addDefaultCellValidators(column);
		}

		// get pointers to table components
		this.table = typeof _table == 'string' ? _$(_table) : _table ;
		if (!this.table) alert("Invalid table given: " + _table);
		this.tHead = this.table.tHead;
		this.tBody = this.table.tBodies[0];

		// create table body if needed
		if (!tBody) {
			tBody = document.createElement("TBODY");
			table.insertBefore(tBody, table.firstChild);
		}

		// create table header if needed
		if (!tHead) {
			tHead = document.createElement("THEAD");
			table.insertBefore(tHead, tBody);
		}

		// if header is empty use first body row as header
		if (tHead.rows.length == 0 && tBody.rows.length > 0) 
			tHead.appendChild(tBody.rows[0]);

		// check that header has exactly one row
		this.nbHeaderRows = tHead.rows.length;
		/*if (tHead.rows.length != 1) {
        	alert("You table header must have exactly row!");
        	return false;
        }*/

		// load header labels
		var rows = tHead.rows;
		for (var i = 0; i < rows.length; i++) {
			var cols = rows[i].cells;
			var columnIndexInModel = 0;
			for (var j = 0; j < cols.length && columnIndexInModel < columns.length; j++) {
				if (!columns[columnIndexInModel].label) columns[columnIndexInModel].label = cols[j].innerHTML;
				var colspan = parseInt(cols[j].getAttribute("colspan"));
				columnIndexInModel += colspan > 1 ? colspan : 1;
			}
		}

		// load content
		var rows = tBody.rows;
		for (var i = 0; i < rows.length; i++) {
			var rowData = [];
			var cols = rows[i].cells;
			for (var j = 0; j < cols.length && j < columns.length; j++) rowData.push(this.getTypedValue(j, cols[j].innerHTML));
			data.push({ visible: true, originalIndex: i, id: rows[i].id, columns: rowData });
			rows[i].rowId = rows[i].id;
			rows[i].id = this._getRowDOMId(rows[i].id);
		}
	}
};

/**
 * Creates a suitable cell renderer for the column
 * @private
 */
EditableGrid.prototype._createCellRenderer = function(column)
{
	column.cellRenderer = 
		column.enumProvider ? new EnumCellRenderer() :
			column.datatype == "integer" || column.datatype == "double" ? new NumberCellRenderer() :
				column.datatype == "boolean" ? new CheckboxCellRenderer() : 
					column.datatype == "email" ? new EmailCellRenderer() : 
						column.datatype == "website" || column.datatype == "url" ? new WebsiteCellRenderer() : 
							column.datatype == "date" ? new DateCellRenderer() : 
								new CellRenderer();

							// give access to the column from the cell renderer
							if (column.cellRenderer) {
								column.cellRenderer.editablegrid = this;
								column.cellRenderer.column = column;
							}
};

/**
 * Creates a suitable header cell renderer for the column
 * @private
 */
EditableGrid.prototype._createHeaderRenderer = function(column)
{
	column.headerRenderer = (this.enableSort && column.datatype != "html") ? new SortHeaderRenderer(column.name) : new CellRenderer();

	// give access to the column from the header cell renderer
	if (column.headerRenderer) {
		column.headerRenderer.editablegrid = this;
		column.headerRenderer.column = column;
	}		
};

/**
 * Creates a suitable cell editor for the column
 * @private
 */
EditableGrid.prototype._createCellEditor = function(column)
{
	column.cellEditor = 
		column.enumProvider ? new SelectCellEditor() :
			column.datatype == "integer" || column.datatype == "double" ? new NumberCellEditor(column.datatype) :
				column.datatype == "boolean" ? null :
					column.datatype == "email" ? new TextCellEditor(column.precision) :
						column.datatype == "website" || column.datatype == "url" ? new TextCellEditor(column.precision) :
							column.datatype == "date" ? (typeof $ == 'undefined' || typeof $.datepicker == 'undefined' ? new TextCellEditor(column.precision, 10) : new DateCellEditor({ fieldSize: column.precision, maxLength: 10 })) :
								new TextCellEditor(column.precision);  

							// give access to the column from the cell editor
							if (column.cellEditor) {
								column.cellEditor.editablegrid = this;
								column.cellEditor.column = column;
							}
};

/**
 * Creates a suitable header cell editor for the column
 * @private
 */
EditableGrid.prototype._createHeaderEditor = function(column)
{
	column.headerEditor =  new TextCellEditor();  

	// give access to the column from the cell editor
	if (column.headerEditor) {
		column.headerEditor.editablegrid = this;
		column.headerEditor.column = column;
	}
};

/**
 * Returns the number of rows
 */
EditableGrid.prototype.getRowCount = function()
{
	return this.data.length;
};

/**
 * Returns the number of columns
 */
EditableGrid.prototype.getColumnCount = function()
{
	return this.columns.length;
};

/**
 * Returns true if the column exists
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.hasColumn = function(columnIndexOrName)
{
	return this.getColumnIndex(columnIndexOrName) >= 0;
};

/**
 * Returns the column
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.getColumn = function(columnIndexOrName)
{
	var colIndex = this.getColumnIndex(columnIndexOrName);
	if (colIndex < 0) { alert("[getColumn] Column not found with index or name " + columnIndexOrName); return null; }
	return this.columns[colIndex];
};

/**
 * Returns the name of a column
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.getColumnName = function(columnIndexOrName)
{
	return this.getColumn(columnIndexOrName).name;
};

/**
 * Returns the label of a column
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.getColumnLabel = function(columnIndexOrName)
{
	return this.getColumn(columnIndexOrName).label;
};

/**
 * Returns the type of a column
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.getColumnType = function(columnIndexOrName)
{
	return this.getColumn(columnIndexOrName).datatype;
};

/**
 * Returns the unit of a column
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.getColumnUnit = function(columnIndexOrName)
{
	return this.getColumn(columnIndexOrName).unit;
};

/**
 * Returns the precision of a column
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.getColumnPrecision = function(columnIndexOrName)
{
	return this.getColumn(columnIndexOrName).precision;
};

/**
 * Returns true if the column is to be displayed in a bar chart
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.isColumnBar = function(columnIndexOrName)
{
	var column = this.getColumn(columnIndexOrName);
	return (column.bar && column.isNumerical());
};

/**
 * Returns true if the column is numerical (double or integer)
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.isColumnNumerical = function(columnIndexOrName)
{
	var column = this.getColumn(columnIndexOrName);
	return column.isNumerical();;
};

/**
 * Returns the value at the specified index
 * @param {Integer} rowIndex
 * @param {Integer} columnIndex
 */
EditableGrid.prototype.getValueAt = function(rowIndex, columnIndex)
{
	// check and get column
	if (columnIndex < 0 || columnIndex >= this.columns.length) { alert("[getValueAt] Invalid column index " + columnIndex); return null; }
	var column = this.columns[columnIndex];

	// get value in model
	if (rowIndex < 0) return column.label;

	if (typeof this.data[rowIndex] == 'undefined') alert("[getValueAt] Invalid row index " + rowIndex);
	var rowData = this.data[rowIndex]['columns'];
	return rowData ? rowData[columnIndex] : null;
};

/**
 * Sets the value at the specified index
 * @param {Integer} rowIndex
 * @param {Integer} columnIndex
 * @param {Object} value
 * @param {Boolean} render
 */
EditableGrid.prototype.setValueAt = function(rowIndex, columnIndex, value, render)
{
	if (typeof render == "undefined") render = true;
	var previousValue = null;;

	// check and get column
	if (columnIndex < 0 || columnIndex >= this.columns.length) { alert("[setValueAt] Invalid column index " + columnIndex); return null; }
	var column = this.columns[columnIndex];

	// set new value in model
	if (rowIndex < 0) {
		previousValue = column.label;
		column.label = value;
	}
	else {
		var rowData = this.data[rowIndex]['columns'];
		previousValue = rowData[columnIndex];
		if (rowData) rowData[columnIndex] = this.getTypedValue(columnIndex, value);
	}

	// render new value
	if (render) {
		var renderer = rowIndex < 0 ? column.headerRenderer : column.cellRenderer;  
		renderer._render(rowIndex, columnIndex, this.getCell(rowIndex, columnIndex), value);
	}

	return previousValue;
};

/**
 * Find column index from its name
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.getColumnIndex = function(columnIndexOrName)
{
	if (typeof columnIndexOrName == "undefined" || columnIndexOrName === "") return -1;

	// TODO: problem because the name of a column could be a valid index, and we cannot make the distinction here!

	// if columnIndexOrName is a number which is a valid index return it
	if (!isNaN(columnIndexOrName) && columnIndexOrName >= 0 && columnIndexOrName < this.columns.length) return columnIndexOrName;

	// otherwise search for the name
	for (var c = 0; c < this.columns.length; c++) if (this.columns[c].name == columnIndexOrName) return c;

	return -1;
};

/**
 * Get HTML row object at given index
 * @param {Integer} index of the row
 */
EditableGrid.prototype.getRow = function(rowIndex)
{
	if (rowIndex < 0) return this.tHead.rows[rowIndex + this.nbHeaderRows];
	if (typeof this.data[rowIndex] == 'undefined') alert("[getRow] Invalid row index " + rowIndex);
	return _$(this._getRowDOMId(this.data[rowIndex].id));
};

/**
 * Get row id for given row index
 * @param {Integer} index of the row
 */
EditableGrid.prototype.getRowId = function(rowIndex)
{
	return (rowIndex < 0 || rowIndex >= this.data.length) ? null : this.data[rowIndex]['id'];
};

/**
 * Get index of row with given id
 * @param {Integer} rowId or HTML row object
 */
EditableGrid.prototype.getRowIndex = function(rowId) 
{
	rowId = typeof rowId == 'object' ? rowId.rowId : rowId;
	for (var rowIndex = 0; rowIndex < this.data.length; rowIndex++) if (this.data[rowIndex].id == rowId) return rowIndex;
	return -1; 
};

/**
 * Get custom row attribute specified in XML
 * @param {Integer} index of the row
 * @param {String} name of the attribute
 */
EditableGrid.prototype.getRowAttribute = function(rowIndex, attributeName)
{
	return this.data[rowIndex][attributeName];
};

/**
 * Set custom row attribute
 * @param {Integer} index of the row
 * @param {String} name of the attribute
 * @param value of the attribute
 */
EditableGrid.prototype.setRowAttribute = function(rowIndex, attributeName, attributeValue)
{
	this.data[rowIndex][attributeName] = attributeValue;
};

/**
 * Get Id of row in HTML DOM
 * @private
 */
EditableGrid.prototype._getRowDOMId = function(rowId)
{
	return this.currentContainerid != null ? this.name + "_" + rowId : rowId;
};

/**
 * Remove row with given id
 * @param {Integer} rowIndex
 */
EditableGrid.prototype.removeRow = function(rowIndex)
{
	// work on unfiltered data
	var filterActive = this.dataUnfiltered != null; 
	if (filterActive) this.data = this.dataUnfiltered;

	// delete row from DOM (needed for attach mode)
	var tr = _$(this._getRowDOMId(this.data[rowIndex].id));
	if (tr != null) this.tBody.removeChild(tr);
	
	// delete row from data
	this.data.splice(rowIndex, 1);
	
	if (filterActive) {

		// keep only visible rows in data
		this.dataUnfiltered = this.data;
		this.data = [];
		for (var r = 0; r < this.dataUnfiltered.length; r++) if (this.dataUnfiltered[r].visible) this.data.push(this.dataUnfiltered[r]);
	}

	this.refreshGrid();
};

/**
 * Return an associative array (column name => value) of values in row with given index 
 * @param {Integer} rowIndex
 */
EditableGrid.prototype.getRowValues = function(rowIndex) 
{
	var rowValues = {};
	for (var columnIndex = 0; columnIndex < this.getColumnCount(); columnIndex++) { 
		rowValues[this.getColumnName(columnIndex)] = this.getValueAt(rowIndex, columnIndex);
	}
	return rowValues;
};

/**
 * Append row with given id and data
 * @param {Integer} rowId id of new row
 * @param {Integer} columns
 * @param {Boolean} dontSort
 */
EditableGrid.prototype.appendRow = function(rowId, cellValues, dontSort)
{
	return this.insertRow(rowId, this.data.length, cellValues, dontSort);
};

/**
 * Insert row with given id and data at given location
 * @param {Integer} rowIndex index of row before which to insert new row
 * @param {Integer} rowId id of new row
 * @param {Integer} columns
 * @param {Boolean} dontSort
 */
EditableGrid.prototype.insertRow = function(rowIndex, rowId, cellValues, dontSort)
{
	// work on unfiltered data
	var filterActive = this.dataUnfiltered != null; 
	if (filterActive) this.data = this.dataUnfiltered;

	// append row in DOM (needed for attach mode)
	if (this.currentContainerid == null) {
		var tr = this.tBody.insertRow(rowIndex);
		tr.id = this._getRowDOMId(rowId);
		for (var c = 0; c < this.columns.length; c++) tr.insertCell(c);
	}
	
	// append row in data
	var rowData = [];
	for (var c = 0; c < this.columns.length; c++) {
		var cellValue = this.columns[c].name in cellValues ? cellValues[this.columns[c].name] : "";
		rowData.push(this.getTypedValue(c, cellValue));
	}
	for (var r = 0; r < this.data.length; r++) if (this.data[r].originalIndex >= rowIndex) this.data[r].originalIndex++;
	this.data.splice(rowIndex, 0, { visible: true, originalIndex: rowIndex, id: rowId, columns: rowData });
	
	if (filterActive) {

		// keep only visible rows in data
		this.dataUnfiltered = this.data;
		this.data = [];
		for (var r = 0; r < this.dataUnfiltered.length; r++) if (this.dataUnfiltered[r].visible) this.data.push(this.dataUnfiltered[r]);
	}

	this.refreshGrid();

	// sort and filter table
	if (!dontSort) this.sort();
	this.filter();
};

/**
 * Sets the column header cell renderer for the specified column index
 * @param {Object} columnIndexOrName index or name of the column
 * @param {CellRenderer} cellRenderer
 */
EditableGrid.prototype.setHeaderRenderer = function(columnIndexOrName, cellRenderer)
{
	var columnIndex = this.getColumnIndex(columnIndexOrName);
	if (columnIndex < 0) alert("[setHedareRenderer] Invalid column: " + columnIndexOrName);
	else {
		var column = this.columns[columnIndex];
		column.headerRenderer = (this.enableSort && column.datatype != "html") ? new SortHeaderRenderer(column.name, cellRenderer) : cellRenderer;

		// give access to the column from the cell renderer
		if (cellRenderer) {
			if (this.enableSort && column.datatype != "html") {
				column.headerRenderer.editablegrid = this;
				column.headerRenderer.column = column;
			}
			cellRenderer.editablegrid = this;
			cellRenderer.column = column;
		}
	}
};

/**
 * Sets the cell renderer for the specified column index
 * @param {Object} columnIndexOrName index or name of the column
 * @param {CellRenderer} cellRenderer
 */
EditableGrid.prototype.setCellRenderer = function(columnIndexOrName, cellRenderer)
{
	var columnIndex = this.getColumnIndex(columnIndexOrName);
	if (columnIndex < 0) alert("[setCellRenderer] Invalid column: " + columnIndexOrName);
	else {
		var column = this.columns[columnIndex];
		column.cellRenderer = cellRenderer;

		// give access to the column from the cell renderer
		if (cellRenderer) {
			cellRenderer.editablegrid = this;
			cellRenderer.column = column;
		}
	}
};

/**
 * Sets the cell editor for the specified column index
 * @param {Object} columnIndexOrName index or name of the column
 * @param {CellEditor} cellEditor
 */
EditableGrid.prototype.setCellEditor = function(columnIndexOrName, cellEditor)
{
	var columnIndex = this.getColumnIndex(columnIndexOrName);
	if (columnIndex < 0) alert("[setCellEditor] Invalid column: " + columnIndexOrName);
	else {
		var column = this.columns[columnIndex];
		column.cellEditor = cellEditor;

		// give access to the column from the cell editor
		if (cellEditor) {
			cellEditor.editablegrid = this;
			cellEditor.column = column;
		}
	}
};

/**
 * Sets the header cell editor for the specified column index
 * @param {Object} columnIndexOrName index or name of the column
 * @param {CellEditor} cellEditor
 */
EditableGrid.prototype.setHeaderEditor = function(columnIndexOrName, cellEditor)
{
	var columnIndex = this.getColumnIndex(columnIndexOrName);
	if (columnIndex < 0) alert("[setHeaderEditor] Invalid column: " + columnIndexOrName);
	else {
		var column = this.columns[columnIndex];
		column.headerEditor = cellEditor;

		// give access to the column from the cell editor
		if (cellEditor) {
			cellEditor.editablegrid = this;
			cellEditor.column = column;
		}
	}
};

/**
 * Sets the enum provider for the specified column index
 * @param {Object} columnIndexOrName index or name of the column
 * @param {EnumProvider} enumProvider
 */
EditableGrid.prototype.setEnumProvider = function(columnIndexOrName, enumProvider)
{
	var columnIndex = this.getColumnIndex(columnIndexOrName);
	if (columnIndex < 0) alert("[setEnumProvider] Invalid column: " + columnIndexOrName);
	else this.columns[columnIndex].enumProvider = enumProvider;

	// we must recreate the cell renderer and editor for this column
	this._createCellRenderer(this.columns[columnIndex]);
	this._createCellEditor(this.columns[columnIndex]);
};

/**
 * Clear all cell validators for the specified column index
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.clearCellValidators = function(columnIndexOrName)
{
	var columnIndex = this.getColumnIndex(columnIndexOrName);
	if (columnIndex < 0) alert("[clearCellValidators] Invalid column: " + columnIndexOrName);
	else this.columns[columnIndex].cellValidators = [];
};

/**
 * Adds default cell validators for the specified column index (according to the column type)
 * @param {Object} columnIndexOrName index or name of the column
 */
EditableGrid.prototype.addDefaultCellValidators = function(columnIndexOrName)
{
	var columnIndex = this.getColumnIndex(columnIndexOrName);
	if (columnIndex < 0) alert("[addDefaultCellValidators] Invalid column: " + columnIndexOrName);
	return this._addDefaultCellValidators(this.columns[columnIndex]);
};

/**
 * Adds default cell validators for the specified column
 * @private
 */
EditableGrid.prototype._addDefaultCellValidators = function(column)
{
	if (column.datatype == "integer" || column.datatype == "double") column.cellValidators.push(new NumberCellValidator(column.datatype));
	else if (column.datatype == "email") column.cellValidators.push(new EmailCellValidator());
	else if (column.datatype == "website" || column.datatype == "url") column.cellValidators.push(new WebsiteCellValidator());
	else if (column.datatype == "date") column.cellValidators.push(new DateCellValidator(this));
};

/**
 * Adds a cell validator for the specified column index
 * @param {Object} columnIndexOrName index or name of the column
 * @param {CellValidator} cellValidator
 */
EditableGrid.prototype.addCellValidator = function(columnIndexOrName, cellValidator)
{
	var columnIndex = this.getColumnIndex(columnIndexOrName);
	if (columnIndex < 0) alert("[addCellValidator] Invalid column: " + columnIndexOrName);
	else this.columns[columnIndex].cellValidators.push(cellValidator);
};

/**
 * Sets the table caption: set as null to remove
 * @param columnIndexOrName
 * @param caption
 * @return
 */
EditableGrid.prototype.setCaption = function(caption)
{
	this.caption = caption;
};

/**
 * Get cell element at given row and column
 */
EditableGrid.prototype.getCell = function(rowIndex, columnIndex)
{
	var row = this.getRow(rowIndex);
	return row.cells[columnIndex];
};

/**
 * Get cell X position relative to the first non static offset parent
 * @private
 */
EditableGrid.prototype.getCellX = function(oElement)
{
	var iReturnValue = 0;
	while (oElement != null && this.isStatic(oElement)) try {
		iReturnValue += oElement.offsetLeft;
		oElement = oElement.offsetParent;
	} catch(err) { oElement = null; }
	return iReturnValue;
};

/**
 * Get cell Y position relative to the first non static offset parent
 * @private
 */
EditableGrid.prototype.getCellY = function(oElement)
{
	var iReturnValue = 0;
	while (oElement != null && this.isStatic(oElement)) try {
		iReturnValue += oElement.offsetTop;
		oElement = oElement.offsetParent;
	} catch(err) { oElement = null; }
	return iReturnValue;
};

/**
 * Private
 * @param containerid
 * @param className
 * @param tableid
 * @return
 */
EditableGrid.prototype._rendergrid = function(containerid, className, tableid)
{
	with (this) {

		// if we are already attached to an existing table, just update the cell contents
		if (typeof table != "undefined" && table != null) {

			var _data = dataUnfiltered == null ? data : dataUnfiltered; 

			// render headers
			_renderHeaders();

			// render content
			var rows = tBody.rows;
			var skipped = 0;
			var displayed = 0;
			var rowIndex = 0;
			
			for (var i = 0; i < rows.length; i++) {

				// filtering and pagination in attach mode means hiding rows
				if (!_data[i].visible || (pageSize > 0 && displayed >= pageSize)) { rows[i].style.display = 'none'; }
				else {
					if (skipped < pageSize * currentPageIndex) { skipped++; rows[i].style.display = 'none'; }
					else {
						displayed++;
						var rowData = [];
						var cols = rows[i].cells;
						rows[i].style.display = '';
						for (var j = 0; j < cols.length && j < columns.length; j++) 
							if (columns[j].renderable) columns[j].cellRenderer._render(rowIndex, j, cols[j], getValueAt(rowIndex,j));
					}
					rowIndex++;
				}
			}

			// attach handler on click or double click 
			table.editablegrid = this;
			if (doubleclick) table.ondblclick = function(e) { this.editablegrid.mouseClicked(e); };
			else table.onclick = function(e) { this.editablegrid.mouseClicked(e); }; 
		}

		// we must render a whole new table
		else {

			if (!_$(containerid)) return alert("Unable to get element [" + containerid + "]");

			currentContainerid = containerid;
			currentClassName = className;
			currentTableid = tableid;

			var startRowIndex = 0;
			var endRowIndex = getRowCount();

			// paginate if required
			if (pageSize > 0) {
				startRowIndex = currentPageIndex * pageSize;
				endRowIndex = Math.min(getRowCount(), startRowIndex + pageSize); 
			}

			// create editablegrid table and add it to our container 
			this.table = document.createElement("table");
			table.className = className || "editablegrid";          
			if (typeof tableid != "undefined") table.id = tableid;
			while (_$(containerid).hasChildNodes()) _$(containerid).removeChild(_$(containerid).firstChild);
			_$(containerid).appendChild(table);

			// create header
			if (caption) {
				var captionElement = document.createElement("CAPTION");
				captionElement.innerHTML = this.caption;
				table.appendChild(captionElement);
			}

			this.tHead = document.createElement("THEAD");
			table.appendChild(tHead);
			var trHeader = tHead.insertRow(0);
			var columnCount = getColumnCount();
			for (var c = 0; c < columnCount; c++) {
				var headerCell = document.createElement("TH");
				var td = trHeader.appendChild(headerCell);
				columns[c].headerRenderer._render(-1, c, td, columns[c].label);
			}

			// create body and rows
			this.tBody = document.createElement("TBODY");
			table.appendChild(tBody);
			var insertRowIndex = 0;
			for (var i = startRowIndex; i < endRowIndex; i++) {
				var tr = tBody.insertRow(insertRowIndex++);
				tr.rowId = data[i]['id'];
				tr.id = this._getRowDOMId(data[i]['id']);
				for (j = 0; j < columnCount; j++) {

					// create cell and render its content
					var td = tr.insertCell(j);
					columns[j].cellRenderer._render(i, j, td, getValueAt(i,j));
				}
			}

			// attach handler on click or double click 
			_$(containerid).editablegrid = this;
			if (doubleclick) _$(containerid).ondblclick = function(e) { this.editablegrid.mouseClicked(e); };
			else _$(containerid).onclick = function(e) { this.editablegrid.mouseClicked(e); }; 
		}

		// callback
		tableRendered(containerid, className, tableid);
	}
};


/**
 * Renders the grid as an HTML table in the document
 * @param {String} containerid 
 * id of the div in which you wish to render the HTML table (this parameter is ignored if you used attachToHTMLTable)
 * @param {String} className 
 * CSS class name to be applied to the table (this parameter is ignored if you used attachToHTMLTable)
 * @param {String} tableid
 * ID to give to the table (this parameter is ignored if you used attachToHTMLTable)
 * @see EditableGrid#attachToHTMLTable
 * @see EditableGrid#loadXML
 */
EditableGrid.prototype.renderGrid = function(containerid, className, tableid)
{
	with (this) {

		// back to first page before rendering
		this.currentPageIndex = 0;
		
		_rendergrid(containerid, className, tableid);

		// sort and filter table
		sort();
		filter();
	}
};

/**
 * Refreshes the grid
 * @return
 */
EditableGrid.prototype.refreshGrid = function()
{
	if (this.currentContainerid != null) this.table = null; // if we are not in "attach mode", clear table to force a full re-render
	this._rendergrid(this.currentContainerid, this.currentClassName, this.currentTableid);
};

/**
 * Render all column headers 
 * @private
 */
EditableGrid.prototype._renderHeaders = function() 
{
	with (this) {
		var rows = tHead.rows;
		for (var i = 0; i < 1 /*rows.length*/; i++) {
			var rowData = [];
			var cols = rows[i].cells;
			var columnIndexInModel = 0;
			for (var j = 0; j < cols.length && columnIndexInModel < columns.length; j++) {
				columns[columnIndexInModel].headerRenderer._render(-1, columnIndexInModel, cols[j], columns[columnIndexInModel].label);
				var colspan = parseInt(cols[j].getAttribute("colspan"));
				columnIndexInModel += colspan > 1 ? colspan : 1;
			}
		}
	}
};

/**
 * Mouse click handler
 * @param {Object} e
 * @private
 */
EditableGrid.prototype.mouseClicked = function(e) 
{
	e = e || window.event;
	with (this) {

		// get row and column index from the clicked cell
		var target = e.target || e.srcElement;

		// go up parents to find a cell or a link under the clicked position
		while (target) if (target.tagName == "A" || target.tagName == "TD" || target.tagName == "TH") break; else target = target.parentNode;
		if (!target || !target.parentNode || !target.parentNode.parentNode || (target.parentNode.parentNode.tagName != "TBODY" && target.parentNode.parentNode.tagName != "THEAD") || target.isEditing) return;

		// don't handle clicks on links
		if (target.tagName == "A") return;

		// get cell position in table
		var rowIndex = target.parentNode.rowIndex - nbHeaderRows; // remove header rows
		var columnIndex = target.cellIndex;

		var column = columns[columnIndex];
		if (column) {

			// if another row has been selected: callback
			if (rowIndex > -1 && rowIndex != lastSelectedRowIndex) {
				rowSelected(lastSelectedRowIndex, rowIndex);				
				lastSelectedRowIndex = rowIndex;
			}

			// edit current cell value
			if (!column.editable) { readonlyWarning(column); }
			else {
				if (rowIndex < 0) { 
					if (column.headerEditor && isHeaderEditable(rowIndex, columnIndex)) 
						column.headerEditor.edit(rowIndex, columnIndex, target, column.label);
				}
				else if (column.cellEditor && isEditable(rowIndex, columnIndex))
					column.cellEditor.edit(rowIndex, columnIndex, target, getValueAt(rowIndex, columnIndex));
			}
		}
	}
};

/**
 * Sort on a column
 * @param {Object} columnIndexOrName index or name of the column
 * @param {Boolean} descending
 */
EditableGrid.prototype.sort = function(columnIndexOrName, descending)
{
	with (this) {

		if (typeof columnIndexOrName  == 'undefined' && sortedColumnName === -1) {
			
			// avoid a double render, but still send the expected callback
			tableSorted(-1, sortDescending);
			return true;
		}

		if (typeof columnIndexOrName  == 'undefined') columnIndexOrName = sortedColumnName;
		if (typeof descending  == 'undefined') descending = sortDescending;
		
		var columnIndex = columnIndexOrName;
		if (columnIndex !== -1) {
			columnIndex = this.getColumnIndex(columnIndexOrName);
			if (columnIndex < 0) {
				alert("[sort] Invalid column: " + columnIndexOrName);
				return false;
			}
		}

		if (!enableSort) {
			tableSorted(columnIndex, descending);
			return;
		}
		
		// work on unfiltered data
		var filterActive = dataUnfiltered != null; 
		if (filterActive) data = dataUnfiltered;

		var type = columnIndex < 0 ? "" : getColumnType(columnIndex);
		var row_array = [];
		var rowCount = getRowCount();
		for (var i = 0; i < rowCount - (ignoreLastRow ? 1 : 0); i++) row_array.push([columnIndex < 0 ? null : getValueAt(i, columnIndex), i, data[i].originalIndex]);
		row_array.sort(columnIndex < 0 ? unsort :
			type == "integer" || type == "double" ? sort_numeric :
				type == "boolean" ? sort_boolean :
					type == "date" ? sort_date :
						sort_alpha);

		if (descending) row_array = row_array.reverse();
		if (ignoreLastRow) row_array.push([columnIndex < 0 ? null : getValueAt(rowCount - 1, columnIndex), rowCount - 1, data[rowCount - 1].originalIndex]);

		// rebuild data using the new order
		var _data = data;
		data = [];
		for (var i = 0; i < row_array.length; i++) data.push(_data[row_array[i][1]]);
		delete row_array;

		if (filterActive) {

			// keep only visible rows in data
			dataUnfiltered = data;
			data = [];
			for (var r = 0; r < rowCount; r++) if (dataUnfiltered[r].visible) data.push(dataUnfiltered[r]);
		}

		// refresh grid and callback
		refreshGrid();
		tableSorted(columnIndex, descending);
		return true;
	}
};


/**
 * Filter the content of the table
 * @param {String} filterString String string used to filter: all words must be found in the row
 */
EditableGrid.prototype.filter = function(filterString)
{
	with (this) {

		if (typeof filterString != 'undefined') currentFilter = filterString;

		// un-filter if no or empty filter set
		if (currentFilter == null || currentFilter == "") {
			if (dataUnfiltered != null) {
				data = dataUnfiltered;
				dataUnfiltered = null;
				setPageIndex(0);
				tableFiltered();
			}
			return;
		}		

		var words = currentFilter.toLowerCase().split(" ");

		// work on unfiltered data
		if (dataUnfiltered != null) data = dataUnfiltered;

		var rowCount = getRowCount();
		for (var r = 0; r < rowCount; r++) {
			data[r].visible = true;
			var rowContent = ""; 
			for (var c = 0; c < data[r].columns.length; c++) rowContent += data[r].columns[c] + " ";

			// if row contents does not match one word in the filter, hide the row
			for (var i = 0; i < words.length; i++) {
				if (rowContent.toLowerCase().indexOf(words[i]) < 0) {
					data[r].visible = false;
					break;
				}
			}
		}

		// keep only visible rows in data
		dataUnfiltered = data;
		data = [];
		for (var r = 0; r < rowCount; r++) if (dataUnfiltered[r].visible) data.push(dataUnfiltered[r]);

		// refresh grid (back on first page) and callback
		setPageIndex(0);
		tableFiltered();
	}
};

/**
 * Sets the page size(pageSize of 0 means no pagination)
 * @param {Integer} pageSize Integer page size
 */
EditableGrid.prototype.setPageSize = function(pageSize)
{
	this.pageSize = parseInt(pageSize);
	if (isNaN(this.pageSize)) this.pageSize = 0;
	this.currentPageIndex = 0;
	this.refreshGrid();
};

/**
 * Returns the number of pages according to the current page size
 */
EditableGrid.prototype.getPageCount = function()
{
	if (this.pageSize <= 0) { alert("getPageCount: no or invalid page size defined (" + this.pageSize + ")"); return -1; }
	return Math.ceil(this.getRowCount() / this.pageSize);
};

/**
 * Returns the number of pages according to the current page size
 */
EditableGrid.prototype.getCurrentPageIndex = function()
{
	if (this.pageSize <= 0) { alert("getCurrentPage: no or invalid page size defined (" + this.pageSize + ")"); return -1; }
	return this.currentPageIndex;
};

/**
 * Sets the current page (no effect if pageSize is 0)
 * @param {Integer} pageIndex Integer page index
 */
EditableGrid.prototype.setPageIndex = function(pageIndex)
{
	this.currentPageIndex = pageIndex;
	this.refreshGrid();
};

/**
 * Go the previous page if we are not already on the first page
 * @return
 */
EditableGrid.prototype.prevPage = function()
{
	if (this.canGoBack()) this.setPageIndex(this.getCurrentPageIndex() - 1);
};

/**
 * Go the first page if we are not already on the first page
 * @return
 */
EditableGrid.prototype.firstPage = function()
{
	if (this.canGoBack()) this.setPageIndex(0);
};

/**
 * Go the next page if we are not already on the last page
 * @return
 */
EditableGrid.prototype.nextPage = function()
{
	if (this.canGoForward()) this.setPageIndex(this.getCurrentPageIndex() + 1);
};

/**
 * Go the last page if we are not already on the last page
 * @return
 */
EditableGrid.prototype.lastPage = function()
{
	if (this.canGoForward()) this.setPageIndex(this.getPageCount() - 1);
};

/**
 * Returns true if we are not already on the first page
 * @return
 */
EditableGrid.prototype.canGoBack = function()
{
	return this.getCurrentPageIndex() > 0;
};

/**
 * Returns true if we are not already on the last page
 * @return
 */
EditableGrid.prototype.canGoForward = function()
{
	return this.getCurrentPageIndex() < this.getPageCount() - 1;
};

/**
 * Returns an interval { startPageIndex: ..., endPageIndex: ... } so that a window of the given size is visible around the current page (hence the 'sliding').
 * If pagination is not enabled this method displays an alert and returns null.
 * If pagination is enabled but there is only one page this function returns null (wihtout error).
 * @param slidingWindowSize size of the visible window
 * @return
 */
EditableGrid.prototype.getSlidingPageInterval = function(slidingWindowSize)
{
	var nbPages = this.getPageCount();
	if (nbPages <= 1) return null;

	var curPageIndex = this.getCurrentPageIndex();
	var startPageIndex = Math.max(0, curPageIndex - (slidingWindowSize/2));
	var endPageIndex = Math.min(nbPages, curPageIndex + (slidingWindowSize/2));

	if (endPageIndex - startPageIndex < slidingWindowSize) {
		var diff = slidingWindowSize - (endPageIndex - startPageIndex);
		startPageIndex = Math.max(0, startPageIndex - diff);
		endPageIndex = Math.min(nbPages, endPageIndex + diff);
	}

	return { startPageIndex: startPageIndex, endPageIndex: endPageIndex };
};

/**
 * Returns an array of page indices in the given interval.
 * 
 * @param interval
 * The given interval must be an object with properties 'startPageIndex' and 'endPageIndex'.
 * This interval may for example have been obtained with getCurrentPageInterval.
 * 
 * @param callback
 * The given callback is applied to each page index before adding it to the result array.
 * This callback is optional: if none given, the page index will be added as is to the array.
 * If given , the callback will be called with two parameters: pageIndex (integer) and isCurrent (boolean).
 * 
 * @return
 */
EditableGrid.prototype.getPagesInInterval = function(interval, callback)
{
	var pages = [];
	for (var p = interval.startPageIndex; p < interval.endPageIndex; p++) {
		pages.push(typeof callback == 'function' ? callback(p, p == this.getCurrentPageIndex()) : p);
	}
	return pages;
};
