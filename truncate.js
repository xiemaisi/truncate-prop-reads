/*******************************************************************************
 * Copyright (c) 2013 Max Schaefer.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Max Schaefer - initial API and implementation
 *******************************************************************************/

/*global require process*/

var esprima = require('esprima'),
	escodegen = require('escodegen'),
	estraverse = require('estraverse'),
	fs = require('fs'),
	path = require('path'),
	htmlparser = require('htmlparser'),
	url = require('url');

function visit(root, emit) {
	function process(nd, parent, idx) {
		if (Object(nd) != nd) {
			return;
		}

		nd.parent = parent;
		nd.child_idx = idx;

		if (Array.isArray(nd)) {
			for (var i = 0, n = nd.length; i < n; ++i) {
				process(nd[i], nd, i);
			}
			return;
		}

		estraverse.VisitorKeys[nd.type].forEach(function(ch) {
			if ((nd.type === 'AssignmentExpression' || nd.type === 'ForInStatement') && ch === 'left') {
				nd[ch].lhs = true;
			}
			process(nd[ch], nd, ch);
		});

		if (nd.type === 'MemberExpression' && !nd.computed && !nd.lhs) {
			var prop_name = nd.property.name;
			nd.property.name = '$$' + nd.property.name;
			var undo = truncate(parent, idx);
			emit(root, nd.loc.start.line, nd.range[0], nd.range[1]);
			undo();
			nd.property.name = prop_name;
		}
	}

	function truncate(nd, idx) {
		var undo, body;
		
		if (Array.isArray(nd)) {
			var removed = nd.splice(idx + 1, nd.length - idx);
			undo = truncate(nd.parent, nd.child_idx);
			return function() {
				undo();
				for (var i = 0, n = removed.length; i < n; i++) {
					nd[nd.length] = removed[i];
				}
			};
		} else {
			switch (nd.type) {
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'Program':
				return function() {};
			case 'AssignmentExpression':
			case 'BinaryExpression':
			case 'LogicalExpression':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'left') {
					nd.parent[nd.child_idx] = nd.left;
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else {
					return undo;
				}
				break;
			case 'ArrayExpression':
			case 'BlockStatement':
			case 'BreakStatement':
			case 'CatchClause':
			case 'ContinueStatement':
			case 'DebuggerStatement':
			case 'DirectiveStatement':
			case 'EmptyStatement':
			case 'ExpressionStatement':
			case 'Identifier':
			case 'Literal':
			case 'LabeledStatement':
			case 'ObjectExpression':
			case 'Property':
			case 'ReturnStatement':
			case 'SequenceExpression':
			case 'SwitchStatement':
			case 'SwitchCase':
			case 'ThisExpression':
			case 'ThrowStatement':
			case 'UnaryExpression':
			case 'UpdateExpression':
			case 'VariableDeclaration':
			case 'VariableDeclarator':
			case 'YieldExpression':
				return truncate(nd.parent, nd.child_idx);
			case 'CallExpression':
			case 'NewExpression':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'callee') {
					nd.parent[nd.child_idx] = nd.callee;
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else {
					return undo;
				}
				break;
			case 'ConditionalExpression':
			case 'IfStatement':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'test') {
					nd.parent[nd.child_idx] = (nd.type === 'ConditionalExpression' ? nd.test : {
						type: 'ExpressionStatement',
						expression: nd.test
					});
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else if (idx === 'consequent' && nd.type === 'IfStatement') {
					var alternate = nd.alternate;
					nd.alternate = null;
					return function() {
						undo();
						nd.alternate = alternate;
					};
				} else {
					return undo;
				}
				break;
			case 'DoWhileStatement':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'body') {
					nd.parent[nd.child_idx] = nd.body;
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else {
					return undo;
				}
				break;
			case 'ForStatement':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'init') {
					nd.parent[nd.child_idx] = (nd.init.type === 'VariableDeclaration' ? nd.init : {
						type: 'ExpressionStatement',
						expression: nd.init
					});
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else if (idx === 'test') {
					var update = nd.update;
					body = nd.body;
					nd.update = null;
					nd.body = {
						type: 'EmptyStatement'
					};
					return function() {
						undo();
						nd.update = update;
						nd.body = body;
					};
				} else if (idx === 'update') {
					body = nd.body;
					nd.body = {
						type: 'EmptyStatement'
					};
					return function() {
						undo();
						nd.body = body;
					};
				} else {
					return undo;
				}
				break;
			case 'ForInStatement':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'right') {
					nd.parent[nd.child_idx] = {
						type: 'ExpressionStatement',
						expression: nd.right
					};
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else {
					return undo;
				}
				break;
			case 'MemberExpression':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'object') {
					nd.parent[nd.child_idx] = nd.object;
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else {
					return undo;
				}
				break;
			case 'TryStatement':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'block') {
					nd.parent[nd.child_idx] = nd.block;
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else {
					return undo;
				}
				break;
			case 'WhileStatement':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'test') {
					nd.parent[nd.child_idx] = {
						type: 'ExpressionStatement',
						expression: nd.test
					};
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else {
					return undo;
				}
				break;
			case 'WithStatement':
				undo = truncate(nd.parent, nd.child_idx);
				if (idx === 'object') {
					nd.parent[nd.child_idx] = {
						type: 'ExpressionStatement',
						expression: nd.object
					};
					return function() {
						undo();
						nd.parent[nd.child_idx] = nd;
					};
				} else {
					return undo;
				}
				break;
			default:
				throw new Error(nd.type);
			}
		}
	}

	process(root, null, - 1);
}

var inlinecnt = 0;

function walkDOM(node, baseurl, scripts) {
	if (node.type === 'script') {
		if (!node.attribs || !node.attribs.type || node.attribs.type.match(/JavaScript/i)) {
			var script_code, script_path;
			if (node.attribs && node.attribs.src) {
				script_path = url.parse(url.resolve(baseurl, node.attribs.src.trim())).pathname;
				script_code = fs.readFileSync(script_path, 'utf-8');
			} else {
				script_path = baseurl + "inline_" + (++inlinecnt) + ".js";
				script_code = node.children[0].raw;
			}
			scripts.push({
				path: script_path,
				source: script_code
			});
		}
	} else if (node.type === 'tag') {
		if (node.children) node.children.forEach(function(ch) {
			walkDOM(ch, baseurl, scripts);
		});
	} else if (Array.isArray(node)) {
		node.forEach(function(ch) {
			walkDOM(ch, baseurl, scripts);
		});
	}
}

function extract_js(file) {
	var handler = new htmlparser.DefaultHandler();
	var HTMLparser = new htmlparser.Parser(handler);
	var html = fs.readFileSync(file, 'utf-8');
	var scripts = [];
	HTMLparser.parseComplete(html);
	walkDOM(handler.dom, path.dirname(file) + '/', scripts);
	return scripts;
}

// TODO: better way to check this?
function isFramework(file) {
        return (/^(jquery|mootools|prototype)/i).test(file);
}

var file = process.argv[2],
	outdir = process.argv[3];
if (/\.js$/.test(file)) {
	var ast = esprima.parse(fs.readFileSync(process.argv[2], 'utf-8'), {
		range: true,
		loc: true
	}),
		cnt = 0,
		basename = path.basename(file, '.js');
	visit(ast, function(trunc_ast, start_line, start_offset, end_offset) {
		fs.writeFileSync(outdir + '/' + basename + '_truncated_' + (cnt++) + '.js',
						 '// ' + file + '@' + start_line + ':' + start_offset + '-' + end_offset + '\n' +
						 escodegen.generate(trunc_ast));
	});
} else if (/\.html?$/.test(file)) {
	var scripts = extract_js(file),
		outer_cnt = 0;
	scripts.forEach(function(script, i) {
		var basename = path.basename(script.path, ".js"),
			source = script.source;
		fs.writeFileSync(outdir + '/' + basename + ".js", source);
		if (!isFramework(basename)) {
			var ast = esprima.parse(source, {
				range: true,
				loc: true
			}),
				cnt = 0;
			visit(ast, function(trunc_ast, start_line, start_offset, end_offset) {
				var trunc_name = outdir + '/' + basename + '_truncated_' + (cnt++) + '.js';
				fs.writeFileSync(trunc_name, escodegen.generate(trunc_ast));
				var html = "<!-- " + basename + ".js@" + start_line + ":" + start_offset + "-" + end_offset + " -->\n" +
					       "<html>\n<head>\n<title></title>\n";
				scripts.forEach(function(script, j) {
					if (i === j) {
						html += "<script src='" + path.basename(trunc_name) + "'></script>\n";
					} else {
						html += "<script src='" + path.basename(script.path) + "'></script>\n";
					}
				});
				html += "</head>\n<body></body>\n</html>\n";
				fs.writeFileSync(outdir + '/' + path.basename(file, '.html') + '_truncated_' + (outer_cnt++) + '.html',
				html);
			});
		}
	});
}