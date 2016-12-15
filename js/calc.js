/**
 * See: https://www.reddit.com/r/ClickerHeroes/comments/4naohc/math_and_transcendance/
 */

function buildMode() {
    if(data.settings.buildMode == "idle") {
        return "idle";
    } else if (data.settings.buildMode == "hybrid") {
        return "hybrid";
    } else {
        return "active";
    }
}

function maxTpReward() { 
    return (0.05 + data.outsiders["borb"].level * 0.005) * data.heroSoulsSacrificed;
}
 
function hpScaleFactor() { 
    var zone = data.ascensionZone;
    var i = Math.floor(zone/500);
    var scale = 1.145+i*0.005;
    return scale;
}

function alphaFactor(wepwawetLeveledBeyond8k) { 
    if(wepwawetLeveledBeyond8k) {
        return 1.1085 * Math.log(1 + data.tp/100) / Math.log(hpScaleFactor());
    } else {
        return 1.4067 * Math.log(1 + data.tp/100) / Math.log(hpScaleFactor());
    }
}

/**
 * See: https://www.reddit.com/r/ClickerHeroes/comments/4n80r5/boss_level_to_hit_cap/
 */
function bossToHitCap() {
    var solomon = data.ancients["solomon"].extraInfo.optimalLevel;
    var ponyboy = data.outsiders["ponyboy"].level;
    var tp = data.tp/100; 
    var maxTP = maxTpReward(); // (5% ((+0.5*Borb)%) of your Sacrificed Souls
    
    var multiplier;
    if (solomon < 21) {
        multiplier = 1 + (1 + ponyboy) * (solomon * 0.05);
    } else if (solomon < 41) {
        multiplier = 1 + (1 + ponyboy) * (1 + (solomon - 20) * 0.04);
    } else if (solomon < 61) {
        multiplier = 1 + (1 + ponyboy) * (1.8 + (solomon - 40) * 0.03);
    } else if (solomon < 81) {
        multiplier = 1 + (1 + ponyboy) * (2.4 + (solomon - 60) * 0.02);
    } else {
        multiplier = 1 + (1 + ponyboy) * (2.8 + (solomon - 80) * 0.01);
    }
    
    var bossNumber = Math.ceil(Math.log(maxTP/(20*multiplier))/Math.log(1+tp));
    return bossNumber;
}

function zoneToHitCap() {
    return bossToHitCap() * 5 + 100;
}

function ascensionZone() {
    return data.ascensionZone * 1.05;
}

function tpCapReached() {
    var boss = (ascensionZone() * 1.05 - 100)/5;
    return boss >= bossToHitCap();
}

function resetOptimalLevels() {
    for (var k in data.ancients) {
        data.ancients[k].extraInfo.optimalLevel = null;
    }
}

function calculate() {
    resetOptimalLevels();
    
    var tuneAncient;
    
    if(buildMode() == "idle" || buildMode() == "hybrid") {
        tuneAncient = data.ancients["siyalatas"];
    } else {
        tuneAncient = data.ancients["fragsworth"];
    }
    
    return optimize(tuneAncient);
}

function computeOptimalLevels(tuneAncient, addLevels) {
    var alpha = alphaFactor(data.settings.wep8k);
    var transcendent = alpha > 0;
    var atcap = tpCapReached();
    
    var baseLevel = tuneAncient.level.plus(addLevels);
    for (var k in data.ancients) {
        // Test if this ancient is to be excluded
        if (data.ancients[k].extraInfo.exclude && data.ancients[k].extraInfo.exclude()) {
            continue;
        }
        
        var oldLevel = data.ancients[k].level;
        
        if (oldLevel > 0 || k == "soulbank") {
            var goalFun;
            var hybridRatio;
            if (buildMode() == "idle") {
                goalFun = data.ancients[k].extraInfo.goalIdle;
                hybridRatio = 1;
            } else if(buildMode() == "hybrid") {
                goalFun = data.ancients[k].extraInfo.goalHybrid;
                hybridRatio = data.settings.hybridRatio;
            } else {
                goalFun = data.ancients[k].extraInfo.goalActive;
                hybridRatio = 1;
            }
            
            if(typeof goalFun === 'string') {
                goalFun = data.ancients[k].extraInfo[goalFun];
            }
            
            if (goalFun) {
                var g = goalFun(baseLevel, oldLevel, alpha, atcap, transcendent, data.settings.wep8k, hybridRatio);
                
                
                data.ancients[k].extraInfo.optimalLevel = Decimal.max(data.ancients[k].level, g.ceil());
            }
        }
    }
}

/**
 * Calculate the Hero Soul cost to level all ancients to their optimals.
 *
 * Approximates the cost for an ancient if more than 25,000 calculations would be 
 * required. 
 */
function calculateHSCostToOptimalLevel() {
    multiplier = Math.pow(0.95, data.outsiders["chor'gorloth"].level);
    
    var maxNumSteps = 2500; // Precision of approximation
    
    var totalCost = new Decimal(0);
    for (var k in data.ancients) {
        var oldLevel = data.ancients[k].level;
        if (data.ancients[k].extraInfo.optimalLevel) {
            var optimalLevel = data.ancients[k].extraInfo.optimalLevel;
            
            var diff = optimalLevel.minus(oldLevel);
            if (diff <= 0) {
                data.ancients[k].extraInfo.costToLevelToOptimal = new Decimal(0);
                continue;
            }
            
            var thisAncientCost = 0;
            
            if(data.ancients[k].partialCostfn) {
                // We have defined the partial sum for this level cost formula,
                // use it instead of iterating
                thisAncientCost = data.ancients[k].partialCostfn(optimalLevel).minus(data.ancients[k].partialCostfn(oldLevel));
            } else {
                var numSteps = Decimal.min(maxNumSteps, diff);
                var stepSize = diff.dividedBy(numSteps);
                
                var temp = 0;
                for(var step = 1; step <= numSteps; step++) {
                    var prevAddLevels = step.minus(1).times(stepSize).ceil();
                    var addLevels = step.times(stepSize).ceil();
                    
                    var level = oldLevel.plus(addLevels);
                    var thisStepSize = addLevels.minus(prevAddLevels);
                    
                    temp = temp.plus(data.ancients[k].costfn(level).times(thisStepSize));
                }
                
                thisAncientCost = temp;
            }
            
            if (k != "soulbank") {
                thisAncientCost = thisAncientCost.times(multiplier).ceil();
            }
            
            data.ancients[k].extraInfo.costToLevelToOptimal = thisAncientCost;
            totalCost = totalCost.plus(thisAncientCost); 
        }
    }
    
    return totalCost;
}

function compute(tuneAncient, addLevels) {
    computeOptimalLevels(tuneAncient, addLevels);
    return calculateHSCostToOptimalLevel();
}

function optimize(tuneAncient) {
    var hs = data.heroSoulsForLeveling;
    var baseLevel = tuneAncient.level;
    
    if (! data.ancients["morgulis"].level.greaterThan(0)) {
        // We do not own Morgulis, so activate the soulbank
        data.ancients["soulbank"] = {
            "name": "soulbank", 
            "level": new Decimal(0), 
            "costfn": functions.one,
            "partialCostfn": functions.onePartialSum,
            "extraInfo": {
                "goalIdle": data.ancients["morgulis"].extraInfo.goalIdle,
                "goalHybrid": data.ancients["morgulis"].extraInfo.goalHybrid,
                "goalActive": data.ancients["morgulis"].extraInfo.goalActive,
                }
        };
    }
    
    var left = baseLevel.times(-1);
    if (hs.greaterThan(0)) {
        var right = hs.plus(baseLevel.times(baseLevel.plus(1))).sqrt().ceil().minus(baseLevel);
    } else {
        var right = new Decimal(0);
    }
    var spentHS;
    
    // Iterate until we have converged, or until we are very close to convergence.
    // Converging exactly has run-time complexity in O(log(hs)), which, though sub-
    // polynomial in hs, is still very slow (as hs is basically exponential 
    // in play-time). As such, we'll make do with an approximation.
    var initialDiff = right.minus(left);
    while (right.minus(left).greaterThan(1) && right.minus(left).dividedBy(initialDiff).greaterThan(0.00001)) {
        var mid = right.plus(left).dividedBy(2).floor();
        
        // Level according to RoT and calculate new cost
        spentHS = compute(tuneAncient, mid);
        if (spentHS.lessThan(hs)) {
            left = mid;
        } else { 
            right = mid;
        }
    }
    
    // Level according to RoT and calculate new cost
    spentHS = compute(tuneAncient, left);
    
    if  (data.ancients["soulbank"]) {
        // Soul bank was used, subtract number of HS put into soulbank
        // from the number of spent HS.
        spentHS = spentHs.minus(data.ancients["soulbank"].extraInfo.optimalLevel);
        delete data.ancients["soulbank"];
    }
    
    return spentHS;
}
