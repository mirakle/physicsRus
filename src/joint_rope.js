//-------------------------------------------------------------------------------------------------
// Rope Joint
//
// d = p2 - p1
// u = d / norm(d)
// C = norm(d) - l
// C = sqrt(dot(d, d)) - l
// Cdot = dot(u, v2 + cross(w2, r2) - v1 - cross(w1, r1))
//      = -dot(u, v1) - dot(w1, cross(r1, u)) + dot(u, v2) + dot(w2, cross(r2, u))
// J = [ -u, -cross(r1, u), u, cross(r2, u) ]
//
// JT * lambda = [ -u * lambda, -cross(r1, u) * lambda, u * lambda, cross(r1, u) * lambda ]
//-------------------------------------------------------------------------------------------------

RopeJoint = function(body1, body2, anchor1, anchor2) {
	Joint.call(this, Joint.TYPE_DISTANCE, body1, body2, true);

	// Local anchor points
	this.anchor1 = this.body1.getLocalPoint(anchor1);
	this.anchor2 = this.body2.getLocalPoint(anchor2);

	// Max distance
	this.maxDistance = vec2.dist(anchor1, anchor2);

	// Accumulated impulse
	this.lambda_acc = 0;
}

RopeJoint.prototype = new Joint;
RopeJoint.prototype.constructor = RopeJoint;

RopeJoint.prototype.setWorldAnchor1 = function(anchor1) {
	this.anchor1 = this.body1.getLocalPoint(anchor1);

	this.maxDistance = vec2.dist(anchor1, this.getWorldAnchor2());
}

RopeJoint.prototype.setWorldAnchor2 = function(anchor2) {
	this.anchor2 = this.body2.getLocalPoint(anchor2);

	this.maxDistance = vec2.dist(anchor2, this.getWorldAnchor1());
}

RopeJoint.prototype.serialize = function() {
	return {
		"type": "RopeJoint",
		"body1": this.body1.id,
		"body2": this.body2.id,
		"anchor1": this.body1.getWorldPoint(this.anchor1),
		"anchor2": this.body2.getWorldPoint(this.anchor2),
		"collideConnected": this.collideConnected,
		"maxForce": this.maxForce,
		"breakable": this.breakable,	
	};
}

RopeJoint.prototype.initSolver = function(dt, warmStarting) {
	var body1 = this.body1;
	var body2 = this.body2;

	// Max impulse
	this.maxImpulse = this.maxForce * dt;

	// Transformed r1, r2
	this.r1 = vec2.rotate(vec2.sub(this.anchor1, body1.centroid), body1.a);
	this.r2 = vec2.rotate(vec2.sub(this.anchor2, body2.centroid), body2.a);

	// Delta vector between two world anchors
	var d = vec2.sub(vec2.add(body2.p, this.r2), vec2.add(body1.p, this.r1));

	// Distance between two anchors
	this.distance = d.length();

	//
	var c = this.distance - this.maxDistance;
	if (c > 0) {
		this.cdt = 0;
		this.limitState = Joint.LIMIT_STATE_AT_UPPER;		
	}
	else {
		this.cdt = c / dt;
		this.limitState = Joint.LIMIT_STATE_INACTIVE;		
	}

	// Unit delta vector
	if (this.distance > Joint.LINEAR_SLOP) {
		this.u = vec2.scale(d, 1 / this.distance);
	}
	else {
		this.u = vec2.zero;
	}
	
	// s1, s2
	this.s1 = vec2.cross(this.r1, this.u);
   	this.s2 = vec2.cross(this.r2, this.u);
		
	// invEM = J * invM * JT
   	var em_inv = body1.m_inv + body2.m_inv + body1.i_inv * this.s1 * this.s1 + body2.i_inv * this.s2 * this.s2;
	this.em = em_inv == 0 ? 0 : 1 / em_inv;

	if (warmStarting) {
		// Apply cached constraint impulses
		// V += JT * lambda * invM
		var j = vec2.scale(this.u, this.lambda_acc);

		body1.v.mad(j, -body1.m_inv);
		body1.w -= this.s1 * this.lambda_acc * body1.i_inv;

		body2.v.mad(j, body2.m_inv);
		body2.w += this.s2 * this.lambda_acc * body2.i_inv;
	}
	else {
		this.lambda_acc = 0;
	}
}

RopeJoint.prototype.solveVelocityConstraints = function() {
	var body1 = this.body1;
	var body2 = this.body2;

	// Compute lambda for velocity constraint
	// Solve J * invM * JT * lambda = -(J * V)
	var cdot = this.u.dot(vec2.sub(body2.v, body1.v)) + this.s2 * body2.w - this.s1 * body1.w;
	var lambda = -this.em * (cdot + this.cdt);

	// Accumulate lambda and clamp it to zero
	var lambda_old = this.lambda_acc;
	this.lambda_acc = Math.min(lambda_old + lambda, 0);
	lambda = this.lambda_acc - lambda_old;

	// Apply constraint impulses
	// V += JT * lambda * invM
	var j = vec2.scale(this.u, lambda);

	body1.v.mad(j, -body1.m_inv);
	body1.w -= this.s1 * lambda * body1.i_inv;

	body2.v.mad(j, body2.m_inv);
	body2.w += this.s2 * lambda * body2.i_inv;
}

RopeJoint.prototype.solvePositionConstraints = function() {
	var body1 = this.body1;
	var body2 = this.body2;

	// Transformed r1, r2
	var r1 = vec2.rotate(vec2.sub(this.anchor1, body1.centroid), body1.a);
	var r2 = vec2.rotate(vec2.sub(this.anchor2, body2.centroid), body2.a);

	// Delta vector between two anchors
	var d = vec2.sub(vec2.add(body2.p, r2), vec2.add(body1.p, r1));

	// Distance between two anchors
	var dist = d.length();

	// Unit delta vector
	var u = vec2.scale(d, 1 / dist);

	// Position constraint
	var c = dist - this.maxDistance;
	var correction = Math.clamp(c, 0, Joint.MAX_LINEAR_CORRECTION);

	// Compute lambda for correction
	// Solve J * invM * JT * lambda = -C
	var s1 = vec2.cross(r1, u);
	var s2 = vec2.cross(r2, u);
	var em_inv = body1.m_inv + body2.m_inv + body1.i_inv * s1 * s1 + body2.i_inv * s2 * s2;
	var lambda = em_inv == 0 ? 0 : -correction / em_inv;

	// Apply constraint impulses
	// X += JT * lambda * invM * dt
	var j = vec2.scale(u, lambda);

	body1.p.mad(j, -body1.m_inv);
	body1.a -= s1 * lambda * body1.i_inv;

	body2.p.mad(j, body2.m_inv);
	body2.a += s2 * lambda * body2.i_inv;

	return c < Joint.LINEAR_SLOP;
}

RopeJoint.prototype.getReactionForce = function(dt_inv) {
	return vec2.scale(this.u, this.lambda_acc * dt_inv);
}

RopeJoint.prototype.getReactionTorque = function(dt_inv) {
	return 0;
}