function Space() {
	this.bodyHash = {};
	this.numBodies = 0;

	this.jointHash = {};
	this.numJoints = 0;
	
	this.contactSolverArr = [];
	this.numContacts = 0;

	this.postSolve = function(arb) {};

	this.gravity = new vec2(0, 0);
	this.damping = 1.0;
}

Space.TIME_TO_SLEEP = 0.5;
Space.SLEEP_LINEAR_TOLERANCE = 0.5;
Space.SLEEP_ANGULAR_TOLERANCE = deg2rad(2);

Space.prototype.clear = function() {
	Shape.id_counter = 0;
    Body.id_counter = 0;
    Joint.id_counter = 0;

	for (var i in this.bodyHash) {
		this.removeBody(this.bodyHash[i]);
	}

	this.contactSolverArr = [];

	this.stepCount = 0;
}

Space.prototype.toJSON = function(key) {
	var bodies = [];
	for (var i in this.bodyHash) {
		bodies.push(this.bodyHash[i].serialize());
	}

	var joints = [];
	for (var i in this.jointHash) {
		joints.push(this.jointHash[i].serialize());
	}

	return {
		bodies: bodies,
		joints: joints
	};
}

Space.prototype.create = function(text) {
	var config = JSON.parse(text);

	this.clear();

	for (var i = 0; i < config.bodies.length; i++) {
		var config_body = config.bodies[i];
		var type = config_body.type == "static" ? Body.STATIC : Body.DYNAMIC;
		var body = new Body(type, config_body.position.x, config_body.position.y, config_body.angle);

		for (var j = 0; j < config_body.shapes.length; j++) {
			var config_shape = config_body.shapes[j];
			var shape;

			switch (config_shape.type) {
				case "ShapeCircle":
					shape = new ShapeCircle(config_shape.center.x, config_shape.center.y, config_shape.radius);                
					break;
				case "ShapeSegment":
					shape = new ShapeSegment(config_shape.a, config_shape.b, config_shape.radius);
					break;
				case "ShapePoly":
					shape = new ShapePoly(config_shape.verts);
					break;
			}
			
			shape.e = config_shape.e;
			shape.u = config_shape.u;
			shape.density = config_shape.density;

			body.addShape(shape);
		}
		
		body.resetMassData();
		this.addBody(body);
	}

	for (var i = 0; i < config.joints.length; i++) {
		var config_joint = config.joints[i];
		var body1 = this.bodyHash[config_joint.body1];
		var body2 = this.bodyHash[config_joint.body2];
		var joint;

		switch (config_joint.type) {
		case "AngleJoint":
			joint = new AngleJoint(body1, body2);
			break;
		case "RevoluteJoint":
			joint = new RevoluteJoint(body1, body2, config_joint.anchor);
			joint.enableLimit(config_joint.limitEnabled);
			joint.setLimits(config_joint.limitLowerAngle, config_joint.limitUpperAngle);
			joint.enableMotor(config_joint.motorEnabled);
			joint.setMotorSpeed(config_joint.motorSpeed);
			joint.setMaxMotorTorque(config_joint.maxMotorTorque);
			break;
		case "WeldJoint":
			joint = new WeldJoint(body1, body2, config_joint.anchor);
			break;
		case "DistanceJoint":                
			joint = new DistanceJoint(body1, body2, config_joint.anchor1, config_joint.anchor2);
			joint.setSpringFrequencyHz(config_joint.frequencyHz);
			joint.setSpringDampingRatio(config_joint.dampingRatio);
			break;
		case "LineJoint":
			joint = new LineJoint(body1, body2, config_joint.anchor1, config_joint.anchor2);
			joint.enableMotor(config_joint.motorEnabled);
			joint.setMotorSpeed(config_joint.motorSpeed);
			joint.setMaxMotorTorque(config_joint.maxMotorTorque);
			break;
		case "PrismaticJoint":
			joint = new PrismaticJoint(body1, body2, config_joint.anchor1, config_joint.anchor2);
			break;
		}

		joint.collideConnected = config_joint.collideConnected;
		joint.maxForce = config_joint.maxForce;
		joint.breakable = config_joint.breakable;

		this.addJoint(joint);
	}
}

Space.prototype.addBody = function(body) {
	if (this.bodyHash[body.id]) {
		return;
	}

	this.bodyHash[body.id] = body;
	this.numBodies++;
	
	body.awake(true);
	body.space = this;
	body.cacheData();
}

Space.prototype.removeBody = function(body) {
	if (!this.bodyHash[body.id]) {
		return;
	}

	// Remove linked joint
	for (var i in body.jointHash) {
		this.removeJoint(body.jointHash[i]);
	}

	body.space = null;
	delete this.bodyHash[body.id];
	this.numBodies--;
}

Space.prototype.addJoint = function(joint) {
	if (this.jointHash[joint.id]) {
		return;
	}

	joint.body1.awake(true);
	joint.body2.awake(true);

	this.jointHash[joint.id] = joint;
	this.numJoints++;

	joint.body1.jointHash[joint.id] = joint;
	joint.body2.jointHash[joint.id] = joint;
}

Space.prototype.removeJoint = function(joint) {
	if (!this.jointHash[joint.id]) {
		return;
	}

	joint.body1.awake(true);
	joint.body2.awake(true);

	delete joint.body1.jointHash[joint.id];
	delete joint.body2.jointHash[joint.id];

	delete this.jointHash[joint.id];
	this.numJoints--;
}

Space.prototype.findShapeByPoint = function(p, refShape) {
	var firstShape;

	for (var i in this.bodyHash) {
		var body = this.bodyHash[i];

		for (var j = 0; j < body.shapeArr.length; j++) {
			var shape = body.shapeArr[j];

			if (shape.pointQuery(p)) {
				if (!refShape) {
					return shape;
				}

				if (!firstShape) {
					firstShape = shape;
				}

				if (shape == refShape) {
					refShape = null;
				}
			}
		}
	}

	return firstShape;
}

// TODO: Replace this function to hashing
Space.prototype.shapeById = function(id) {
	var shape;
	for (var i in this.bodyHash) {
		var body = this.bodyHash[i];

		for (var j = 0; j < body.shapeArr.length; j++) {
			if (body.shapeArr[j].id == id) {
				return body.shapeArr[j];
			}
		}
	}

	return null;
}

// ME TOO
Space.prototype.jointById = function(id) {	
	for (var i in this.jointHash) {
		var joint = this.jointHash[i];
		if (joint.id == id) {
			return joint;
		}		
	}

	return null;
}

Space.prototype.findVertexByPoint = function(p, minDist, refVertexId) {
	var firstVertexId = -1;

	refVertexId = refVertexId || -1;

	for (var i in this.bodyHash) {
		var body = this.bodyHash[i];

		for (var j = 0; j < body.shapeArr.length; j++) {
			var shape = body.shapeArr[j];
			var index = shape.findVertexByPoint(p, minDist);
			if (index != -1) {
				var vertex = (shape.id << 16) | index;
				if (refVertexId == -1) {
					return vertex;
				}

				if (firstVertexId == -1) {
					firstVertexId = vertex;
				}

				if (vertex == refVertexId) {
					refVertexId = -1;
				}		
			}
		}
	}

	return firstVertexId;
}

Space.prototype.findEdgeByPoint = function(p, minDist, refEdgeId) {
	var firstEdgeId = -1;

	refEdgeId = refEdgeId || -1;

	for (var i in this.bodyHash) {
		var body = this.bodyHash[i];

		for (var j = 0; j < body.shapeArr.length; j++) {
			var shape = body.shapeArr[j];
			if (shape.type != Shape.TYPE_POLY) {
				continue;
			}

			var index = shape.findEdgeByPoint(p, minDist);
			if (index != -1) {
				var edge = (shape.id << 16) | index;
				if (refEdgeId == -1) {
					return edge;
				}

				if (firstEdgeId == -1) {
					firstEdgeId = edge;
				}

				if (edge == refEdgeId) {
					refEdgeId = -1;
				}		
			}
		}
	}

	return firstEdgeId;	
}

Space.prototype.findJointByPoint = function(p, minDist, refJointId) {
	var firstJointId = -1;

	var dsq = minDist * minDist;

	refJointId = refJointId || -1;

	for (var i in this.jointHash) {
		var joint = this.jointHash[i];
		var jointId = -1;

		if (vec2.distsq(p, joint.getWorldAnchor1()) < dsq) {
			jointId = (joint.id << 16 | 0);
		}
		else if (vec2.distsq(p, joint.getWorldAnchor2()) < dsq) {
			jointId = (joint.id << 16 | 1);
		}

		if (jointId != -1) {
			if (refJointId == -1) {
				return jointId;
			}

			if (firstJointId == -1) {
				firstJointId = jointId;
			}

			if (jointId == refJointId) {
				refJointId = -1;
			}
		}
	}

	return firstJointId;
}

Space.prototype.findContactSolver = function(shape1, shape2) {
	for (var i = 0; i < this.contactSolverArr.length; i++) {
		var contactSolver = this.contactSolverArr[i];
		if (shape1 == contactSolver.shape1 && shape2 == contactSolver.shape2) {
			return contactSolver;
		}
	}

	return null;
}

Space.prototype.genTemporalContactSolvers = function() {
	var t0 = Date.now();
	var newContactSolverArr = [];

	this.numContacts = 0;

	for (var body1_index in this.bodyHash) {
		var body1 = this.bodyHash[body1_index];
		
		body1.stepCount = this.stepCount;

		for (var body2_index in this.bodyHash) {
			var body2 = this.bodyHash[body2_index];

			if (body1.stepCount == body2.stepCount) {
				continue;
			}

			var active1 = body1.isAwake() && !body1.isStatic();
			var active2 = body2.isAwake() && !body2.isStatic();

			if (!active1 && !active2) {
				continue;
			}
						
			if (!body1.isCollidable(body2)) {
				continue;
			}			
		
			if (!body1.bounds.intersectsBounds(body2.bounds)) {
				continue;
			}
	
			for (var i = 0; i < body1.shapeArr.length; i++) {
				for (var j = 0; j < body2.shapeArr.length; j++) {
					var shape1 = body1.shapeArr[i];
					var shape2 = body2.shapeArr[j];
								
					var contactArr = [];
					if (!collision.collide(shape1, shape2, contactArr)) {
						continue;
					}

					this.numContacts += contactArr.length;

					if (shape1.type > shape2.type) {
						var temp = shape1;
						shape1 = shape2;
						shape2 = temp;
					}

					var contactSolver = this.findContactSolver(shape1, shape2);
					if (contactSolver) {
						contactSolver.update(contactArr);
						newContactSolverArr.push(contactSolver);
					}
					else {
						body1.awake(true);
						body2.awake(true);

						var newContactSolver = new ContactSolver(shape1, shape2);
						newContactSolver.contactArr = contactArr;
						newContactSolver.e = Math.max(shape1.e, shape2.e);
						newContactSolver.u = Math.sqrt(shape1.u * shape2.u);
						newContactSolverArr.push(newContactSolver);
					}
				}
			}
		}
	}

	stats.timeCollision = Date.now() - t0;

	return newContactSolverArr;
}

Space.prototype.initSolver = function(dt, dt_inv, warmStarting) {
	var t0 = Date.now();

	// Initialize contact solvers
	for (var i = 0; i < this.contactSolverArr.length; i++) {
		this.contactSolverArr[i].initSolver(dt_inv);
	}

	// Initialize joint solver
	for (var i in this.jointHash) {
		this.jointHash[i].initSolver(dt, warmStarting);
	}

	// Warm starting (apply cached impulse)
	if (warmStarting) {
		for (var i = 0; i < this.contactSolverArr.length; i++) {
			this.contactSolverArr[i].warmStart();
		}
	}

	stats.timeInitSolver = Date.now() - t0;
}

Space.prototype.velocitySolver = function(iteration) {
	var t0 = Date.now();
	
	for (var i = 0; i < iteration; i++) {
		for (var j in this.jointHash) {
			this.jointHash[j].solveVelocityConstraints();
		}

		for (var j = 0; j < this.contactSolverArr.length; j++) {
			this.contactSolverArr[j].solveVelocityConstraints();
		}
	}

	stats.timeVelocitySolver = Date.now() - t0;
}

Space.prototype.positionSolver = function(iteration) {
	var t0 = Date.now();    

	var positionSolved = false;

	stats.positionIterations = 0;
	
	for (var i = 0; i < iteration; i++) {
		var contactsOk = true;
		var jointsOk = true;

		for (var j = 0; j < this.contactSolverArr.length; j++) {
			var contactOk = this.contactSolverArr[j].solvePositionConstraints();
			contactsOk = contactOk && contactsOk;
		}

		for (var j in this.jointHash) {
			var jointOk = this.jointHash[j].solvePositionConstraints();
			jointsOk = jointOk && jointsOk;
		}
		
		if (contactsOk && jointsOk) {
			// exit early if the position errors are small
			positionSolved = true;
			break;
		}

		stats.positionIterations++;
	}

	stats.timePositionSolver = Date.now() - t0;

	return positionSolved;
}

Space.prototype.step = function(dt, vel_iteration, pos_iteration, warmStarting, allowSleep) {
	var dt_inv = 1 / dt; 

	this.stepCount++;
	
	// Generate contact & contactSolver
	this.contactSolverArr = this.genTemporalContactSolvers();

	// Initialize contacts & joints solver
	this.initSolver(dt, dt_inv, warmStarting);    

	// Intergrate velocity
	var damping = this.damping < 1 ? Math.pow(this.damping, dt) : 1;
	for (var i in this.bodyHash) {
		var body = this.bodyHash[i];
		if (body.isDynamic() && body.isAwake()) {
			body.updateVelocity(this.gravity, damping, dt);
		}
	}

	//
	for (var i in this.jointHash) {
		var joint = this.jointHash[i];
		var body1 = joint.body1;
		var body2 = joint.body2;

		var awake1 = body1.isAwake() && !body1.isStatic();
		var awake2 = body2.isAwake() && !body2.isStatic();

		if (awake1 ^ awake2) {
			if (!awake1)
				body1.awake(true);
			if (!awake2)
				body2.awake(true);
		}
	}

	// Iterative velocity constraints solver
	this.velocitySolver(vel_iteration);

	// Intergrate position
	for (var i in this.bodyHash) {
		var body = this.bodyHash[i];
		if (body.isDynamic() && body.isAwake()) {
			body.updatePosition(dt);
		}
	}

	// Process breakable joint
	for (var i in this.jointHash) {
		var joint = this.jointHash[i];
		if (joint.breakable) {
			if (joint.getReactionForce(dt_inv).lengthsq() >= joint.maxForce * joint.maxForce)
				this.removeJoint(joint);
		}
	}

	// Iterative position constraints solver
	var positionSolved = this.positionSolver(pos_iteration);

	// 
	for (var i in this.bodyHash) {
		var body = this.bodyHash[i];
		body.syncTransform();
	}

	// Post solve collision callback
	for (var i = 0; i < this.contactSolverArr.length; i++) {
		var arb = this.contactSolverArr[i];
		this.postSolve(arb);
	}

	for (var i in this.bodyHash) {
		var body = this.bodyHash[i];
		if (body.isDynamic() && body.isAwake()) {
			body.cacheData();
		}
	}

	// Process sleeping
	if (allowSleep) {
		var minSleepTime = 999999;

		var linTolSqr = Space.SLEEP_LINEAR_TOLERANCE * Space.SLEEP_LINEAR_TOLERANCE;
		var angTolSqr = Space.SLEEP_ANGULAR_TOLERANCE * Space.SLEEP_ANGULAR_TOLERANCE;

		for (var i in this.bodyHash) {
		   var body = this.bodyHash[i];
		   
			if (!body.isDynamic()) {
				continue;
			}

			if (body.w * body.w > angTolSqr || body.v.dot(body.v) > linTolSqr) {
				body.sleepTime = 0;
				minSleepTime = 0;
			}
			else {
				body.sleepTime += dt;
				minSleepTime = Math.min(minSleepTime, body.sleepTime);
			}
		}

		if (positionSolved && minSleepTime >= Space.TIME_TO_SLEEP) {
			for (var i in this.bodyHash) {
				var body = this.bodyHash[i];
				body.awake(false);
			}
		}
	}	
}

