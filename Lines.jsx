/*
    Lines v2.0
    Generate paths from points.
*/
(function lines(thisObj) {

    /* Build UI */
    function buildUI(thisObj) {
        var windowTitle = "Lines";
        var win = (thisObj instanceof Panel) ? thisObj : new Window('palette', windowTitle);
        win.orientation = "column";
        win.alignChildren = ["left", "top"];
        win.spacing = 10;
        win.margins = 16;
        var group1 = win.add("group");
        group1.spacing = 9;
        group1.margins = 0;
        group1.orientation = "row";
        win.button1 = group1.add("button", undefined, "2 Points");
        win.button2 = group1.add("button", undefined, "Angle");
        var group2 = win.add("group");
        group2.spacing = 9;
        group2.margins = 0;
        group2.orientation = "row";
        win.button3 = group2.add("button", undefined, "Selection");
        win.button4 = group2.add("button", undefined, "Position");
        var group3 = win.add("group");
        group3.spacing = 9;
        group3.margins = 0;
        group3.orientation = "row";
        win.button5 = group3.add("button", undefined, "Bound");
        win.button6 = group3.add("button", undefined, "RectIt");
        win.button1.onClick = function () { main("Points"); };
        win.button2.onClick = function () { main("Angle"); };
        win.button3.onClick = function () { main("Selection"); };
        win.button4.onClick = function () { main("Position"); };
        win.button5.onClick = function () { main("Bound"); };
        win.button6.onClick = function () { main("Rect"); };
        win.layout.layout(true);
        return win;
    }

    // Show the Panel
    var w = buildUI(thisObj);
    w.toString() == "[object Panel]" ? w : w.show();

    function main(flag) {
        var comp = getActiveComp();
        if (!comp) return;
        try {
            switch (flag) {
                case "Points":
                case "Angle":
                    app.beginUndoGroup("Add Path");
                    addSingle(getShapeLayer(comp, false), flag);
                    break;
                case "Selection":
                    app.beginUndoGroup("Add Paths in Batch");
                    function isPointControl(property) {
                        return property.matchName == "ADBE Point Control";
                    }
                    var pointControls = comp.selectedLayers[0].selectedProperties.filter(isPointControl);
                    addFromSelection(pointControls, getShapeLayer(comp, true));
                    break;
                case "Position":
                    app.beginUndoGroup("Add Paths in Batch");
                    var positions = [];
                    var layers = comp.selectedLayers;
                    for (var i = 0, len = layers.length; i < len; i++) {
                        positions.push(layers[i].property("Position"));
                    }
                    addFromPosition(positions, getShapeLayer(comp, true));
                    break;
                case "Bound":
                    app.beginUndoGroup("Add Path from Bound");
                    var layers = comp.selectedLayers;
                    target = getShapeLayer(comp, true);
                    for (var i = 0, len = layers.length; i < len; i++) {
                        addFromBound(layers[i], target);
                    }
                    break;
                case "Rect":
                    app.beginUndoGroup("Add Point Controls");
                    for (var i = 0, len = comp.selectedLayers.length; i < len; i++) {
                        addRectPointControls(comp.selectedLayers[i]);
                    }
                    break;
            }
        } catch (error) {
            comp.layers.addNull(); //防止不生成撤销组
            app.endUndoGroup();
            app.executeCommand(16);
            alert(error.toString());
        }
        return;
    }

    function getActiveComp() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("请选择一个合成!");
        }
        return comp;
    }

    function getShapeLayer(comp, create) {
        var selectedLayers = comp.selectedLayers;
        if (!create && selectedLayers.length == 1 && selectedLayers[0].property("ADBE Root Vectors Group")) {
            return selectedLayers[0];
        }
        var layer = comp.layers.addShape();
        layer.name = "Lines";
        // layer.property("Position").setValue([0, 0]);
        layer.property("Anchor Point").setValue([comp.width / 2, comp.height / 2]);
        layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
        return layer;
    }

    function getSelectedProperty(layer) {
        var selectedProperties = layer.selectedProperties;
        return (selectedProperties && selectedProperties.length === 1) ? selectedProperties[0] : null;
    }

    function clearSelection(layer) {
        var selectedProperties = layer.selectedProperties;
        for (var i = 0, len = selectedProperties.length; i < len; i++) {
            selectedProperties[i].selected = false;
        }
        return;
    }

    function uniqueName(property, name) {
        var i = 1;
        while (property.parentProperty.property(name + " " + i)) i++;
        property.name = name + " " + i;
        return property;
    }

    function getFolder(path) {
        var folder = new Folder(path);
        if (!folder.exists) folder.create();
        return folder;
    }

    function hexToFileString(hex) {
        var fileString = "";
        for (var i = 0, len = hex.length; i < len; i += 2) {
            fileString += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
        return fileString;
    }

    function writeFile(fileString, pathToFile) {
        var f = new File(pathToFile);
        f.encoding = "BINARY";
        if (f.open("w")) {
            f.write(fileString);
            f.close();
        } else { alert("无法写入文件：" + pathToFile); }
        return f;
    }

    function pair(arr) {
        if (!arr || arr.length < 2) {
            throw new Error("请选择至少两个图层或属性!");
        }
        var list = [], len = arr.length;
        for (var i = 0; i < len; i++) {
            for (var j = i + 1; j < len; j++) {
                list.push([i, j]);
            }
        }
        return list;
    }

    /* Project specific code */

    // 获取/创建 Vectors Group
    function getGroup(layer, name) {
        var vectorGroup = layer.property("ADBE Root Vectors Group");
        var group = vectorGroup.property(name);
        if (!group) {
            group = vectorGroup.addProperty("ADBE Vector Group");
            group.name = name;
        }
        return group;
    }

    // 创建 LineSet 并命名
    function getNewGroup(layer, name) {
        var vectorGroup = layer.property("ADBE Root Vectors Group");
        var group = vectorGroup.addProperty("ADBE Vector Group");
        uniqueName(group, name);
        return group;
    }

    // 创建 Path 并命名
    function createPathInGroup(group) {
        var groupContent = group.addProperty("ADBE Vectors Group");
        var path = groupContent.addProperty("ADBE Vector Shape - Group");
        uniqueName(path, "Line");
        return path;
    }

    // Get the hex string for the .ffx file
    function fileHex(type) {
        switch (type) {
            case "Angle":
                return "52494658000007da466146586865616400000010000000030000004400000001010000004c495354000007b6626573636265736f0000003800000001000000010000000000005da8001df8520000000000640064006400643ff00000000000003ff000000000000000000000ffffffff4c495354000000ac7464737074646f7400000004ffffffff7464706c00000004000000024c49535400000040746473697464697800000004ffffffff74646d6e00000028414442452045666665637420506172616465000000000000000000000000000000000000000000004c495354000000407464736974646978000000040000000074646d6e0000002850736575646f2f4c696e6573466f72416e676c6500000000000000000000000000000000000000007464736e000000054c696e6500004c495354000000647464737074646f7400000004ffffffff7464706c00000004000000014c49535400000040746473697464697800000004ffffffff74646d6e000000284144424520456e64206f6620706174682073656e74696e656c0000000000000000000000000000004c4953540000063c73737063666e616d000000300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004c49535400000274706172547061726e000000040000000374646d6e0000002850736575646f2f4c696e6573466f72416e676c652d30303030000000000000000000000000000000706172640000009400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffff0000000000000000000000000000000074646d6e0000002850736575646f2f4c696e6573466f72416e676c652d30303031000000000000000000000000000000706172640000009400000000000000000000000000000006506f696e740000000000000000000000000000000000000000000000000000000000000000000000000080000000800000000000003200000032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000074646d6e0000002850736575646f2f4c696e6573466f72416e676c652d30303032000000000000000000000000000000706172640000009400000000000000000000000000000003416e676c65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004c4953540000037c746467707464736200000004000000017464736e000000054c696e65000074646d6e0000002850736575646f2f4c696e6573466f72416e676c652d303030300000000000000000000000000000004c495354000000da746462737464736200000004000000037464736e000000010000746462340000007cdb9900010001000000010000000002583f1a36e2eb1c432d3ff00000000000003ff00000000000003ff00000000000003ff00000000000000000000404c0c0c0ffc0c0c0000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000063646174000000280000000000000000000000000000000000000000000000000000000000000000000000000000000074647069000000040000000e74646d6e0000002850736575646f2f4c696e6573466f72416e676c652d303030310000000000000000000000000000004c495354000000da746462737464736200000004000000017464736e00000006506f696e7400746462340000007cdb990002000f0003ffffffff00005da83d9b7cdfd9d7bdbc3ff00000000000003ff00000000000003ff00000000000003ff0000000000000000000040600000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000063646174000000304023333333333333401599999999999a000000000000000000000000000000000000000000000000000000000000000074646d6e0000002850736575646f2f4c696e6573466f72416e676c652d303030320000000000000000000000000000004c495354000000d2746462737464736200000004000000017464736e00000006416e676c6500746462340000007cbd99000100010000000100ff00005da800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000063646174000000280000000000000000000000000000000000000000000000000000000000000000000000000000000074646d6e00000028414442452047726f757020456e6400000000000000000000000000000000000000000000000000007b22636f6e74726f6c4e616d65223a224c696e65222c226d617463686e616d65223a2250736575646f2f4c696e6573466f72416e676c65222c22636f6e74726f6c4172726179223a5b7b226e616d65223a22506f696e74222c2274797065223a22706f696e74222c2263616e486176654b65796672616d6573223a747275652c2263616e4265496e76697369626c65223a747275652c22696e76697369626c65223a66616c73652c226b65796672616d6573223a747275652c226964223a313539313637313535352c22686f6c64223a66616c73652c2270657263656e7458223a302e352c2270657263656e7459223a302e352c226572726f72223a5b0a0a5d7d2c7b226e616d65223a22416e676c65222c2274797065223a22616e676c65222c2263616e486176654b65796672616d6573223a747275652c2263616e4265496e76697369626c65223a66616c73652c2264656661756c74223a302c226b65796672616d6573223a747275652c226964223a343533383932333333362c22686f6c64223a66616c73652c226f70656e223a747275652c226572726f72223a5b0a0a5d7d5d2c2276657273696f6e223a337d";
            case "Points":
            case "Set":
                return "52494658000007e6466146586865616400000010000000030000004400000001010000004c495354000007c2626573636265736f0000003800000001000000010000000000005da8001df8520000000000640064006400643ff00000000000003ff000000000000000000000ffffffff4c495354000000ac7464737074646f7400000004ffffffff7464706c00000004000000024c49535400000040746473697464697800000004ffffffff74646d6e00000028414442452045666665637420506172616465000000000000000000000000000000000000000000004c495354000000407464736974646978000000040000000074646d6e0000002850736575646f2f4c696e6573466f72506f696e7473000000000000000000000000000000000000007464736e000000054c696e6500004c495354000000647464737074646f7400000004ffffffff7464706c00000004000000014c49535400000040746473697464697800000004ffffffff74646d6e000000284144424520456e64206f6620706174682073656e74696e656c0000000000000000000000000000004c4953540000064873737063666e616d000000300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004c49535400000274706172547061726e000000040000000374646d6e0000002850736575646f2f4c696e6573466f72506f696e74732d303030300000000000000000000000000000706172640000009400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffff0000000000000000000000000000000074646d6e0000002850736575646f2f4c696e6573466f72506f696e74732d303030310000000000000000000000000000706172640000009400000000000000000000000000000006506f696e742041000000000000000000000000000000000000000000000000000000000000000000000040000000800000000000001900000032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000074646d6e0000002850736575646f2f4c696e6573466f72506f696e74732d303030320000000000000000000000000000706172640000009400000000000000000000000000000006506f696e7420420000000000000000000000000000000000000000000000000000000000000000000000c0000000800000000000004b0000003200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004c49535400000388746467707464736200000004000000017464736e000000054c696e65000074646d6e0000002850736575646f2f4c696e6573466f72506f696e74732d3030303000000000000000000000000000004c495354000000da746462737464736200000004000000037464736e000000010000746462340000007cdb9900010001000000010000000002583f1a36e2eb1c432d3ff00000000000003ff00000000000003ff00000000000003ff00000000000000000000404c0c0c0ffc0c0c0000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000063646174000000280000000000000000000000000000000000000000000000000000000000000000000000000000000074647069000000040000000e74646d6e0000002850736575646f2f4c696e6573466f72506f696e74732d3030303100000000000000000000000000004c495354000000dc746462737464736200000004000000017464736e00000008506f696e74204100746462340000007cdb990002000f0003ffffffff00005da83d9b7cdfd9d7bdbc3ff00000000000003ff00000000000003ff00000000000003ff0000000000000000000040600000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000063646174000000304013333333333333401599999999999a000000000000000000000000000000000000000000000000000000000000000074646d6e0000002850736575646f2f4c696e6573466f72506f696e74732d3030303200000000000000000000000000004c495354000000dc746462737464736200000004000000017464736e00000008506f696e74204200746462340000007cdb990002000f0003ffffffff00005da83d9b7cdfd9d7bdbc3ff00000000000003ff00000000000003ff00000000000003ff000000000000000000004060000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000006364617400000030402ccccccccccccd401599999999999a000000000000000000000000000000000000000000000000000000000000000074646d6e00000028414442452047726f757020456e6400000000000000000000000000000000000000000000000000007b22636f6e74726f6c4e616d65223a224c696e65222c226d617463686e616d65223a2250736575646f2f4c696e6573466f72506f696e7473222c22636f6e74726f6c4172726179223a5b7b226e616d65223a22506f696e742041222c2274797065223a22706f696e74222c2263616e486176654b65796672616d6573223a747275652c2263616e4265496e76697369626c65223a747275652c22696e76697369626c65223a66616c73652c226b65796672616d6573223a747275652c226964223a323338323433343432342c22686f6c64223a66616c73652c2270657263656e7458223a302e32352c2270657263656e7459223a302e352c226572726f72223a5b0a0a5d7d2c7b226e616d65223a22506f696e742042222c2274797065223a22706f696e74222c2263616e486176654b65796672616d6573223a747275652c2263616e4265496e76697369626c65223a747275652c22696e76697369626c65223a66616c73652c226b65796672616d6573223a747275652c226964223a393238383934373931382c22686f6c64223a66616c73652c2270657263656e7458223a302e37352c2270657263656e7459223a302e352c226572726f72223a5b0a0a5d7d5d2c2276657273696f6e223a337d";
        }
    }

    // 应用 .ffx 文件
    function getFFX(type) {
        var folder = getFolder(Folder.temp.toString() + "/Lines");
        var pathToFile = folder.toString() + "/" + type + "ToLine.ffx";
        var f = new File(pathToFile);
        if (!f.exists) {
            var fileString = hexToFileString(fileHex(type));
            f = writeFile(fileString, pathToFile);
        }
        return f;
    }

    // 绑定表达式
    function bindControl(path, controlName, type) {
        var code = "";
        switch (type) {
            case "Angle":
                code = "\n    const [x1, y1] = [c(\"Point\")[0], c(\"Point\")[1]]\n    const rad = c(\"Angle\") * Math.PI \/ 180;\n    dx = Math.cos(rad), dy = Math.sin(rad);";
                break;
            case "Points":
            case "Set":
                code = "\n    const [x1, y1, x2, y2] = [c(\"Point A\")[0], c(\"Point A\")[1], c(\"Point B\")[0], c(\"Point B\")[1]];\n    dx = x2 - x1, dy = y2 - y1; \n    if (dx == 0 && dy == 0) dx = 1;";
                break;
        }
        path.property("ADBE Vector Shape").expression = "function extendLineInRect(c) {\n    const w = width, h = height;" + code + "\n    const t = [];\n    t.push((0 - x1) \/ dx);\n    t.push((w - x1) \/ dx);\n    t.push((0 - y1) \/ dy);\n    t.push((h - y1) \/ dy);\n\n    const points = t.map(k => [x1 + dx * k, y1 + dy * k])\n        .filter(([x, y]) => x >= -1e-6 && x <= w + 1e-6 && y >= -1e-6 && y <= h + 1e-6);\n    while (points.length < 2) points.push([x1, y1], [x2, y2]);\n    return [points[0], points[1]];\n}\ncreatePath(extendLineInRect(effect(\"" + controlName + "\")),inTangents=[],outTangents=[],isClosed=false);";
        return;
    }

    function bindToTarget(control, p1, p2) {
        function getBindExpression(target) {
            var layerName = target.propertyGroup(target.propertyDepth).name;
            switch (target.matchName) {
                case "ADBE Point Control":
                    return "thisComp.layer(\"" + layerName + "\").effect(\"" + target.name + "\")(\"ADBE Point Control-0001\")";
                case "ADBE Position":
                    return "thisComp.layer(\"" + layerName + "\").transform.position";
            }
        }
        control.property("Point A").expression = getBindExpression(p1);
        control.property("Point B").expression = getBindExpression(p2);
    }

    function addPath(layer, lineSet, type) {
        var line = createPathInGroup(lineSet);
        clearSelection(layer);
        layer.applyPreset(getFFX(type));
        var control = getSelectedProperty(layer);
        if (!control) {
            throw new Error("应用效果失败!");
        }
        control.name = (type == "Set") ? lineSet.name + " " + line.name : line.name;
        bindControl(line, control.name, type);
        control.selected = false;
        return control;
    }

    function addSingle(layer, type) {
        var lineSet = getGroup(layer, "Lines");
        addPath(layer, lineSet, type);
        lineSet.moveTo(1);
        return;
    }

    function addFromSelection(pointControls, targetLayer) {
        var pairList = pair(pointControls);
        var lineSet = getNewGroup(targetLayer, "LineSet");
        for (var p = 0, len = pairList.length; p < len; p++) {
            var control = addPath(targetLayer, lineSet, "Set");
            var pc1 = pointControls[pairList[p][0]];
            var pc2 = pointControls[pairList[p][1]];
            bindToTarget(control, pc1, pc2);
        }
        lineSet.moveTo(1);
        return;
    }

    function addFromPosition(positions, targetLayer) {
        var pairList = pair(positions);
        var lineSet = getNewGroup(targetLayer, "LineSet");
        for (var i = 0, len = pairList.length; i < len; i++) {
            var control = addPath(targetLayer, lineSet, "Set");
            var p1 = positions[pairList[i][0]];
            var p2 = positions[pairList[i][1]];
            bindToTarget(control, p1, p2);
        }
        lineSet.moveTo(1);
        return;
    }

    function addFromBound(layer, targetLayer) {
        // addRectPointControls(layer);
        var lineSet = getNewGroup(targetLayer, "Bound");
        for (var i = 0; i < 4; i++) {
            var control = addPath(targetLayer, lineSet, "Set");
            var pointA = control.property("Point A"), pointB = control.property("Point B");
            var layerExp = "thisComp.layer(\"" + layer.name + "\")"
            var pre = "rect = " + layerExp + ".sourceRectAtTime();\n";
            var expression = {
                "LT": layerExp + ".toComp([rect.left + 1, rect.top + 1])",
                "RT": layerExp + ".toComp([rect.left + rect.width - 1, rect.top + 1])",
                "LB": layerExp + ".toComp([rect.left + 1, rect.top + rect.height - 1])",
                "RB": layerExp + ".toComp([rect.left + rect.width - 1, rect.top + rect.height - 1])"
            };
            switch (i) {
                case 0: // Top
                    pointA.expression = pre + expression["LT"];
                    pointB.expression = pre + expression["RT"];
                    break;
                case 1: // Right
                    pointA.expression = pre + expression["RT"];
                    pointB.expression = pre + expression["RB"];
                    break;
                case 2: // Bottom
                    pointA.expression = pre + expression["RB"];
                    pointB.expression = pre + expression["LB"];
                    break;
                case 3: // Left
                    pointA.expression = pre + expression["LB"];
                    pointB.expression = pre + expression["LT"];
                    break;
            }
        }
        lineSet.moveTo(1);
        return;
    }

    function addRectPointControls(layer) {
        for (var i = 0; i < 4; i++) {
            var pointControl = layer.property("ADBE Effect Parade").property("Rect " + (i + 1));
            if (pointControl) { continue; }
            pointControl = layer.property("ADBE Effect Parade").addProperty("ADBE Point Control");
            pointControl.name = "Rect " + (i + 1);
            var pre = "rect = thisComp.layer(\"" + layer.name + "\").sourceRectAtTime();\n";
            var expression = {
                "LT": "toComp([rect.left + 1, rect.top + 1])",
                "RT": "toComp([rect.left + rect.width - 1, rect.top + 1])",
                "LB": "toComp([rect.left + 1, rect.top + rect.height - 1])",
                "RB": "toComp([rect.left + rect.width - 1, rect.top + rect.height - 1])"
            };
            switch (i) {
                case 0: // Left Top
                    pointControl.property("ADBE Point Control-0001").expression = pre + expression["LT"]; break;
                case 1: // Right Top
                    pointControl.property("ADBE Point Control-0001").expression = pre + expression["RT"]; break;
                case 2: // Left Bottom
                    pointControl.property("ADBE Point Control-0001").expression = pre + expression["LB"]; break;
                case 3: // Right Bottom
                    pointControl.property("ADBE Point Control-0001").expression = pre + expression["RB"]; break;
            }
        }
        return;
    }

})(this);