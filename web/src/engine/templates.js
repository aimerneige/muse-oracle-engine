export function renderTemplate(template, context) {
  return renderTemplateBlocks(template, context);
}

export function renderTemplateBlocks(template, context) {
  var rendered = template.replace(
    /\{\{\-?\s*range\s+([^{}]+?)\s*\}\}([\s\S]*?)\{\{\-?\s*end\s*\}\}/g,
    function (_, expression, block) {
      var values = valueForExpression(expression.trim(), context);
      if (!Array.isArray(values)) {
        return "";
      }
      return values
        .map(function (item) {
          return renderTemplateBlocks(
            block,
            Object.assign({}, context, { ".": item }),
          );
        })
        .join("");
    },
  );
  rendered = rendered.replace(
    /\{\{\-?\s*if\s+([^{}]+?)\s*\}\}([\s\S]*?)(?:\{\{\-?\s*else\s*\}\}([\s\S]*?))?\{\{\-?\s*end\s*\}\}/g,
    function (_, expression, truthyBlock, falsyBlock) {
      var value = valueForExpression(expression.trim(), context);
      var block = isTruthy(value) ? truthyBlock : falsyBlock || "";
      return renderTemplateBlocks(block, context);
    },
  );
  return renderVariables(rendered, context);
}

export function renderVariables(template, context) {
  return template.replace(
    /\{\{\-?\s*([^{}]+?)\s*\-?\}\}/g,
    function (_, expression) {
      return valueForExpression(expression.trim(), context);
    },
  );
}

export function valueForExpression(expression, context) {
  if (expression.indexOf("join ") === 0) {
    return valueForJoinExpression(expression, context);
  }
  if (
    expression.charAt(0) === '"' &&
    expression.charAt(expression.length - 1) === '"'
  ) {
    return expression.slice(1, -1);
  }
  if (expression.indexOf(".") !== 0) {
    return "";
  }
  var path = expression.slice(1).split(".");
  var value = context;
  if (context["."] && path[0] && hasTemplateKey(context["."], path[0])) {
    value = context["."];
  }
  for (var i = 0; i < path.length; i++) {
    if (!path[i]) {
      continue;
    }
    value = getTemplateValue(value, path[i]);
  }
  return value == null ? "" : value;
}

export function valueForJoinExpression(expression, context) {
  var match = expression.match(/^join\s+(\.[^\s]+)\s+"([^"]*)"$/);
  if (!match) {
    return "";
  }
  var values = valueForExpression(match[1], context);
  if (!Array.isArray(values)) {
    return "";
  }
  return values.join(match[2]);
}

export function getTemplateValue(value, key) {
  if (!value) {
    return "";
  }
  if (Object.prototype.hasOwnProperty.call(value, key)) {
    return value[key];
  }
  var jsKey = toJSKey(key);
  if (Object.prototype.hasOwnProperty.call(value, jsKey)) {
    return value[jsKey];
  }
  return "";
}

export function hasTemplateKey(value, key) {
  if (!value) {
    return false;
  }
  return (
    Object.prototype.hasOwnProperty.call(value, key) ||
    Object.prototype.hasOwnProperty.call(value, toJSKey(key))
  );
}

export function isTruthy(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Boolean(value);
}

export function toJSKey(key) {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
