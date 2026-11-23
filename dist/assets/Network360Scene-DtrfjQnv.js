import{a as e,n as t,t as n}from"./jsx-runtime-Wy9s6hX0.js";import{$ as r,B as i,Ct as a,Dt as o,H as s,L as c,N as l,Ot as u,Q as d,R as f,S as p,V as m,Y as h,Z as g,_,_t as v,b as y,c as b,ct as x,dt as S,ft as C,g as w,h as T,ht as E,it as D,j as O,jt as k,kt as A,l as ee,m as te,mt as ne,n as re,o as ie,r as ae,s as j,t as oe,u as se,vt as ce,w as le,xt as ue,y as M}from"./OrbitControls-fh84vy4D.js";import{a as de,c as fe,i as pe,l as me,n as he,o as ge,r as _e,s as ve,t as ye}from"./Water-Bw9BFtmb.js";import{l as N}from"./index-BAWcF0SH.js";var be=me>=125?`uv1`:`uv2`,xe=new te,Se=new u,Ce=class extends c{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type=`LineSegmentsGeometry`,this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute(`position`,new l([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute(`uv`,new l([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,n=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),n.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new f(t,6,1);return this.setAttribute(`instanceStart`,new i(n,3,0)),this.setAttribute(`instanceEnd`,new i(n,3,3)),this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e,t=3){let n;e instanceof Float32Array?n=e:Array.isArray(e)&&(n=new Float32Array(e));let r=new f(n,t*2,1);return this.setAttribute(`instanceColorStart`,new i(r,t,0)),this.setAttribute(`instanceColorEnd`,new i(r,t,t)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new k(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new te);let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;e!==void 0&&t!==void 0&&(this.boundingBox.setFromBufferAttribute(e),xe.setFromBufferAttribute(t),this.boundingBox.union(xe))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new v),this.boundingBox===null&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){let n=this.boundingSphere.center;this.boundingBox.getCenter(n);let r=0;for(let i=0,a=e.count;i<a;i++)Se.fromBufferAttribute(e,i),r=Math.max(r,n.distanceToSquared(Se)),Se.fromBufferAttribute(t,i),r=Math.max(r,n.distanceToSquared(Se));this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error(`THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.`,this)}}toJSON(){}applyMatrix(e){return console.warn(`THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4().`),this.applyMatrix4(e)}},we=class extends Ce{constructor(){super(),this.isLineGeometry=!0,this.type=`LineGeometry`}setPositions(e){let t=e.length-3,n=new Float32Array(2*t);for(let r=0;r<t;r+=3)n[2*r]=e[r],n[2*r+1]=e[r+1],n[2*r+2]=e[r+2],n[2*r+3]=e[r+3],n[2*r+4]=e[r+4],n[2*r+5]=e[r+5];return super.setPositions(n),this}setColors(e,t=3){let n=e.length-t,r=new Float32Array(2*n);if(t===3)for(let i=0;i<n;i+=t)r[2*i]=e[i],r[2*i+1]=e[i+1],r[2*i+2]=e[i+2],r[2*i+3]=e[i+3],r[2*i+4]=e[i+4],r[2*i+5]=e[i+5];else for(let i=0;i<n;i+=t)r[2*i]=e[i],r[2*i+1]=e[i+1],r[2*i+2]=e[i+2],r[2*i+3]=e[i+3],r[2*i+4]=e[i+4],r[2*i+5]=e[i+5],r[2*i+6]=e[i+6],r[2*i+7]=e[i+7];return super.setColors(r,t),this}fromLine(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}},Te=class extends ne{constructor(e){super({type:`LineMaterial`,uniforms:a.clone(a.merge([se.common,se.fog,{worldUnits:{value:1},linewidth:{value:1},resolution:{value:new o(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}}])),vertexShader:`
				#include <common>
				#include <fog_pars_vertex>
				#include <logdepthbuf_pars_vertex>
				#include <clipping_planes_pars_vertex>

				uniform float linewidth;
				uniform vec2 resolution;

				attribute vec3 instanceStart;
				attribute vec3 instanceEnd;

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
						attribute vec4 instanceColorStart;
						attribute vec4 instanceColorEnd;
					#else
						varying vec3 vLineColor;
						attribute vec3 instanceColorStart;
						attribute vec3 instanceColorEnd;
					#endif
				#endif

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#ifdef USE_DASH

					uniform float dashScale;
					attribute float instanceDistanceStart;
					attribute float instanceDistanceEnd;
					varying float vLineDistance;

				#endif

				void trimSegment( const in vec4 start, inout vec4 end ) {

					// trim end segment so it terminates between the camera plane and the near plane

					// conservative estimate of the near plane
					float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
					float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
					float nearEstimate = - 0.5 * b / a;

					float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

					end.xyz = mix( start.xyz, end.xyz, alpha );

				}

				void main() {

					#ifdef USE_COLOR

						vLineColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

					#endif

					#ifdef USE_DASH

						vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
						vUv = uv;

					#endif

					float aspect = resolution.x / resolution.y;

					// camera space
					vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
					vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

					#ifdef WORLD_UNITS

						worldStart = start.xyz;
						worldEnd = end.xyz;

					#else

						vUv = uv;

					#endif

					// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
					// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
					// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
					// perhaps there is a more elegant solution -- WestLangley

					bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

					if ( perspective ) {

						if ( start.z < 0.0 && end.z >= 0.0 ) {

							trimSegment( start, end );

						} else if ( end.z < 0.0 && start.z >= 0.0 ) {

							trimSegment( end, start );

						}

					}

					// clip space
					vec4 clipStart = projectionMatrix * start;
					vec4 clipEnd = projectionMatrix * end;

					// ndc space
					vec3 ndcStart = clipStart.xyz / clipStart.w;
					vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

					// direction
					vec2 dir = ndcEnd.xy - ndcStart.xy;

					// account for clip-space aspect ratio
					dir.x *= aspect;
					dir = normalize( dir );

					#ifdef WORLD_UNITS

						// get the offset direction as perpendicular to the view vector
						vec3 worldDir = normalize( end.xyz - start.xyz );
						vec3 offset;
						if ( position.y < 0.5 ) {

							offset = normalize( cross( start.xyz, worldDir ) );

						} else {

							offset = normalize( cross( end.xyz, worldDir ) );

						}

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

						// don't extend the line if we're rendering dashes because we
						// won't be rendering the endcaps
						#ifndef USE_DASH

							// extend the line bounds to encompass  endcaps
							start.xyz += - worldDir * linewidth * 0.5;
							end.xyz += worldDir * linewidth * 0.5;

							// shift the position of the quad so it hugs the forward edge of the line
							offset.xy -= dir * forwardOffset;
							offset.z += 0.5;

						#endif

						// endcaps
						if ( position.y > 1.0 || position.y < 0.0 ) {

							offset.xy += dir * 2.0 * forwardOffset;

						}

						// adjust for linewidth
						offset *= linewidth * 0.5;

						// set the world position
						worldPos = ( position.y < 0.5 ) ? start : end;
						worldPos.xyz += offset;

						// project the worldpos
						vec4 clip = projectionMatrix * worldPos;

						// shift the depth of the projected points so the line
						// segments overlap neatly
						vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
						clip.z = clipPose.z * clip.w;

					#else

						vec2 offset = vec2( dir.y, - dir.x );
						// undo aspect ratio adjustment
						dir.x /= aspect;
						offset.x /= aspect;

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						// endcaps
						if ( position.y < 0.0 ) {

							offset += - dir;

						} else if ( position.y > 1.0 ) {

							offset += dir;

						}

						// adjust for linewidth
						offset *= linewidth;

						// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
						offset /= resolution.y;

						// select end
						vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

						// back to clip space
						offset *= clip.w;

						clip.xy += offset;

					#endif

					gl_Position = clip;

					vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

					#include <logdepthbuf_vertex>
					#include <clipping_planes_vertex>
					#include <fog_vertex>

				}
			`,fragmentShader:`
				uniform vec3 diffuse;
				uniform float opacity;
				uniform float linewidth;

				#ifdef USE_DASH

					uniform float dashOffset;
					uniform float dashSize;
					uniform float gapSize;

				#endif

				varying float vLineDistance;

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#include <common>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <clipping_planes_pars_fragment>

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
					#else
						varying vec3 vLineColor;
					#endif
				#endif

				vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

					float mua;
					float mub;

					vec3 p13 = p1 - p3;
					vec3 p43 = p4 - p3;

					vec3 p21 = p2 - p1;

					float d1343 = dot( p13, p43 );
					float d4321 = dot( p43, p21 );
					float d1321 = dot( p13, p21 );
					float d4343 = dot( p43, p43 );
					float d2121 = dot( p21, p21 );

					float denom = d2121 * d4343 - d4321 * d4321;

					float numer = d1343 * d4321 - d1321 * d4343;

					mua = numer / denom;
					mua = clamp( mua, 0.0, 1.0 );
					mub = ( d1343 + d4321 * ( mua ) ) / d4343;
					mub = clamp( mub, 0.0, 1.0 );

					return vec2( mua, mub );

				}

				void main() {

					#include <clipping_planes_fragment>

					#ifdef USE_DASH

						if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

						if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

					#endif

					float alpha = opacity;

					#ifdef WORLD_UNITS

						// Find the closest points on the view ray and the line segment
						vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
						vec3 lineDir = worldEnd - worldStart;
						vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

						vec3 p1 = worldStart + lineDir * params.x;
						vec3 p2 = rayEnd * params.y;
						vec3 delta = p1 - p2;
						float len = length( delta );
						float norm = len / linewidth;

						#ifndef USE_DASH

							#ifdef USE_ALPHA_TO_COVERAGE

								float dnorm = fwidth( norm );
								alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

							#else

								if ( norm > 0.5 ) {

									discard;

								}

							#endif

						#endif

					#else

						#ifdef USE_ALPHA_TO_COVERAGE

							// artifacts appear on some hardware if a derivative is taken within a conditional
							float a = vUv.x;
							float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
							float len2 = a * a + b * b;
							float dlen = fwidth( len2 );

							if ( abs( vUv.y ) > 1.0 ) {

								alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

							}

						#else

							if ( abs( vUv.y ) > 1.0 ) {

								float a = vUv.x;
								float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
								float len2 = a * a + b * b;

								if ( len2 > 1.0 ) discard;

							}

						#endif

					#endif

					vec4 diffuseColor = vec4( diffuse, alpha );
					#ifdef USE_COLOR
						#ifdef USE_LINE_COLOR_ALPHA
							diffuseColor *= vLineColor;
						#else
							diffuseColor.rgb *= vLineColor;
						#endif
					#endif

					#include <logdepthbuf_fragment>

					gl_FragColor = diffuseColor;

					#include <tonemapping_fragment>
					#include <${me>=154?`colorspace_fragment`:`encodings_fragment`}>
					#include <fog_fragment>
					#include <premultiplied_alpha_fragment>

				}
			`,clipping:!0}),this.isLineMaterial=!0,this.onBeforeCompile=function(){this.transparent?this.defines.USE_LINE_COLOR_ALPHA=`1`:delete this.defines.USE_LINE_COLOR_ALPHA},Object.defineProperties(this,{color:{enumerable:!0,get:function(){return this.uniforms.diffuse.value},set:function(e){this.uniforms.diffuse.value=e}},worldUnits:{enumerable:!0,get:function(){return`WORLD_UNITS`in this.defines},set:function(e){e===!0?this.defines.WORLD_UNITS=``:delete this.defines.WORLD_UNITS}},linewidth:{enumerable:!0,get:function(){return this.uniforms.linewidth.value},set:function(e){this.uniforms.linewidth.value=e}},dashed:{enumerable:!0,get:function(){return`USE_DASH`in this.defines},set(e){!!e!=`USE_DASH`in this.defines&&(this.needsUpdate=!0),e===!0?this.defines.USE_DASH=``:delete this.defines.USE_DASH}},dashScale:{enumerable:!0,get:function(){return this.uniforms.dashScale.value},set:function(e){this.uniforms.dashScale.value=e}},dashSize:{enumerable:!0,get:function(){return this.uniforms.dashSize.value},set:function(e){this.uniforms.dashSize.value=e}},dashOffset:{enumerable:!0,get:function(){return this.uniforms.dashOffset.value},set:function(e){this.uniforms.dashOffset.value=e}},gapSize:{enumerable:!0,get:function(){return this.uniforms.gapSize.value},set:function(e){this.uniforms.gapSize.value=e}},opacity:{enumerable:!0,get:function(){return this.uniforms.opacity.value},set:function(e){this.uniforms.opacity.value=e}},resolution:{enumerable:!0,get:function(){return this.uniforms.resolution.value},set:function(e){this.uniforms.resolution.value.copy(e)}},alphaToCoverage:{enumerable:!0,get:function(){return`USE_ALPHA_TO_COVERAGE`in this.defines},set:function(e){!!e!=`USE_ALPHA_TO_COVERAGE`in this.defines&&(this.needsUpdate=!0),e===!0?(this.defines.USE_ALPHA_TO_COVERAGE=``,this.extensions.derivatives=!0):(delete this.defines.USE_ALPHA_TO_COVERAGE,this.extensions.derivatives=!1)}}}),this.setValues(e)}},Ee=new A,De=new u,Oe=new u,P=new A,F=new A,I=new A,ke=new u,Ae=new d,L=new s,je=new u,Me=new te,Ne=new v,R=new A,z,B;function Pe(e,t,n){return R.set(0,0,-t,1).applyMatrix4(e.projectionMatrix),R.multiplyScalar(1/R.w),R.x=B/n.width,R.y=B/n.height,R.applyMatrix4(e.projectionMatrixInverse),R.multiplyScalar(1/R.w),Math.abs(Math.max(R.x,R.y))}function Fe(e,t){let n=e.matrixWorld,r=e.geometry,i=r.attributes.instanceStart,a=r.attributes.instanceEnd,o=Math.min(r.instanceCount,i.count);for(let r=0,s=o;r<s;r++){L.start.fromBufferAttribute(i,r),L.end.fromBufferAttribute(a,r),L.applyMatrix4(n);let o=new u,s=new u;z.distanceSqToSegment(L.start,L.end,s,o),s.distanceTo(o)<B*.5&&t.push({point:s,pointOnLine:o,distance:z.origin.distanceTo(s),object:e,face:null,faceIndex:r,uv:null,[be]:null})}}function Ie(e,t,n){let r=t.projectionMatrix,i=e.material.resolution,a=e.matrixWorld,o=e.geometry,s=o.attributes.instanceStart,c=o.attributes.instanceEnd,l=Math.min(o.instanceCount,s.count),d=-t.near;z.at(1,I),I.w=1,I.applyMatrix4(t.matrixWorldInverse),I.applyMatrix4(r),I.multiplyScalar(1/I.w),I.x*=i.x/2,I.y*=i.y/2,I.z=0,ke.copy(I),Ae.multiplyMatrices(t.matrixWorldInverse,a);for(let t=0,o=l;t<o;t++){if(P.fromBufferAttribute(s,t),F.fromBufferAttribute(c,t),P.w=1,F.w=1,P.applyMatrix4(Ae),F.applyMatrix4(Ae),P.z>d&&F.z>d)continue;if(P.z>d){let e=P.z-F.z,t=(P.z-d)/e;P.lerp(F,t)}else if(F.z>d){let e=F.z-P.z,t=(F.z-d)/e;F.lerp(P,t)}P.applyMatrix4(r),F.applyMatrix4(r),P.multiplyScalar(1/P.w),F.multiplyScalar(1/F.w),P.x*=i.x/2,P.y*=i.y/2,F.x*=i.x/2,F.y*=i.y/2,L.start.copy(P),L.start.z=0,L.end.copy(F),L.end.z=0;let o=L.closestPointToPointParameter(ke,!0);L.at(o,je);let l=g.lerp(P.z,F.z,o),f=l>=-1&&l<=1,p=ke.distanceTo(je)<B*.5;if(f&&p){L.start.fromBufferAttribute(s,t),L.end.fromBufferAttribute(c,t),L.start.applyMatrix4(a),L.end.applyMatrix4(a);let r=new u,i=new u;z.distanceSqToSegment(L.start,L.end,i,r),n.push({point:i,pointOnLine:r,distance:z.origin.distanceTo(i),object:e,face:null,faceIndex:t,uv:null,[be]:null})}}}var Le=class extends r{constructor(e=new Ce,t=new Te({color:Math.random()*16777215})){super(e,t),this.isLineSegments2=!0,this.type=`LineSegments2`}computeLineDistances(){let e=this.geometry,t=e.attributes.instanceStart,n=e.attributes.instanceEnd,r=new Float32Array(2*t.count);for(let e=0,i=0,a=t.count;e<a;e++,i+=2)De.fromBufferAttribute(t,e),Oe.fromBufferAttribute(n,e),r[i]=i===0?0:r[i-1],r[i+1]=r[i]+De.distanceTo(Oe);let a=new f(r,2,1);return e.setAttribute(`instanceDistanceStart`,new i(a,1,0)),e.setAttribute(`instanceDistanceEnd`,new i(a,1,1)),this}raycast(e,t){let n=this.material.worldUnits,r=e.camera;r===null&&!n&&console.error(`LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.`);let i=e.params.Line2===void 0?0:e.params.Line2.threshold||0;z=e.ray;let a=this.matrixWorld,o=this.geometry,s=this.material;B=s.linewidth+i,o.boundingSphere===null&&o.computeBoundingSphere(),Ne.copy(o.boundingSphere).applyMatrix4(a);let c;if(c=n?B*.5:Pe(r,Math.max(r.near,Ne.distanceToPoint(z.origin)),s.resolution),Ne.radius+=c,z.intersectsSphere(Ne)===!1)return;o.boundingBox===null&&o.computeBoundingBox(),Me.copy(o.boundingBox).applyMatrix4(a);let l;l=n?B*.5:Pe(r,Math.max(r.near,Me.distanceToPoint(z.origin)),s.resolution),Me.expandByScalar(l),z.intersectsBox(Me)!==!1&&(n?Fe(this,t):Ie(this,r,t))}onBeforeRender(e){let t=this.material.uniforms;t&&t.resolution&&(e.getViewport(Ee),this.material.uniforms.resolution.value.set(Ee.z,Ee.w))}},Re=class extends Le{constructor(e=new we,t=new Te({color:Math.random()*16777215})){super(e,t),this.isLine2=!0,this.type=`Line2`}},V=e(t()),ze=V.forwardRef(function({points:e,color:t=16777215,vertexColors:n,linewidth:r,lineWidth:i,segments:a,dashed:s,...c},l){var d;let f=ee(e=>e.size),m=V.useMemo(()=>a?new Le:new Re,[a]),[h]=V.useState(()=>new Te),g=(n==null||(d=n[0])==null?void 0:d.length)===4?4:3,_=V.useMemo(()=>{let r=a?new Ce:new we,i=e.map(e=>{let t=Array.isArray(e);return e instanceof u||e instanceof A?[e.x,e.y,e.z]:e instanceof o?[e.x,e.y,0]:t&&e.length===3?[e[0],e[1],e[2]]:t&&e.length===2?[e[0],e[1],0]:e});if(r.setPositions(i.flat()),n){t=16777215;let e=n.map(e=>e instanceof p?e.toArray():e);r.setColors(e.flat(),g)}return r},[e,a,n,g]);return V.useLayoutEffect(()=>{m.computeLineDistances()},[e,m]),V.useLayoutEffect(()=>{s?h.defines.USE_DASH=``:delete h.defines.USE_DASH,h.needsUpdate=!0},[s,h]),V.useEffect(()=>()=>{_.dispose(),h.dispose()},[_]),V.createElement(`primitive`,re({object:m,ref:l},c),V.createElement(`primitive`,{object:_,attach:`geometry`}),V.createElement(`primitive`,re({object:h,attach:`material`,color:t,vertexColors:!!n,resolution:[f.width,f.height],linewidth:r??i??1,dashed:s,transparent:g===4},c)))}),Be=parseInt(`187`.replace(/\D+/g,``)),Ve=class extends ne{constructor(){super({uniforms:{time:{value:0},fade:{value:1}},vertexShader:`
      uniform float time;
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 0.5);
        gl_PointSize = size * (30.0 / -mvPosition.z) * (3.0 + sin(time + 100.0));
        gl_Position = projectionMatrix * mvPosition;
      }`,fragmentShader:`
      uniform sampler2D pointTexture;
      uniform float fade;
      varying vec3 vColor;
      void main() {
        float opacity = 1.0;
        if (fade == 1.0) {
          float d = distance(gl_PointCoord, vec2(0.5, 0.5));
          opacity = 1.0 / (1.0 + exp(16.0 * (d - 0.25)));
        }
        gl_FragColor = vec4(vColor, opacity);

        #include <tonemapping_fragment>
	      #include <${Be>=154?`colorspace_fragment`:`encodings_fragment`}>
      }`})}},He=e=>new u().setFromSpherical(new ce(e,Math.acos(1-Math.random()*2),Math.random()*2*Math.PI)),Ue=V.forwardRef(({radius:e=100,depth:t=50,count:n=5e3,saturation:r=0,factor:i=4,fade:a=!1,speed:o=1},s)=>{let c=V.useRef(null),[l,u,d]=V.useMemo(()=>{let a=[],o=[],s=Array.from({length:n},()=>(.5+.5*Math.random())*i),c=new p,l=e+t,u=t/n;for(let e=0;e<n;e++)l-=u*Math.random(),a.push(...He(l).toArray()),c.setHSL(e/n,r,.9),o.push(c.r,c.g,c.b);return[new Float32Array(a),new Float32Array(o),new Float32Array(s)]},[n,t,i,e,r]);j(e=>c.current&&(c.current.uniforms.time.value=e.clock.elapsedTime*o));let[f]=V.useState(()=>new Ve);return V.createElement(`points`,{ref:s},V.createElement(`bufferGeometry`,null,V.createElement(`bufferAttribute`,{attach:`attributes-position`,args:[l,3]}),V.createElement(`bufferAttribute`,{attach:`attributes-color`,args:[u,3]}),V.createElement(`bufferAttribute`,{attach:`attributes-size`,args:[d,1]})),V.createElement(`primitive`,{ref:c,object:f,attach:`material`,blending:2,"uniforms-fade-value":a,depthWrite:!1,transparent:!0,vertexColors:!0}))});function We(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new _;c.morphTargetsRelative=s;let l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0,p=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let t in d.morphAttributes){if(!i.has(t))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;if(d.morphAttributes[t].length!==e[0].morphAttributes[t].length)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have the same number of morph targets for the "`+t+`" morph attribute.`),null;o[t]===void 0&&(o[t]=[]),o[t].push(d.morphAttributes[t]),p++}if(p!==i.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of morph attributes.`),null;if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=Ge(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t!==0){c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=Ge(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}}return c}function Ge(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new w(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}var H=n();function Ke(e){let t=Math.max(1,Math.floor(e));return()=>(t=t*16807%2147483647)/2147483647}function qe(e,t){let n=new p(t),r=e.attributes.position.count,i=new Float32Array(r*3);for(let e=0;e<r;e++)i[e*3]=n.r,i[e*3+1]=n.g,i[e*3+2]=n.b;return e.setAttribute(`color`,new w(i,3)),e}function U(e,t,[n=0,r=0,i=0]=[],a){let o=e.index?e.toNonIndexed():e;a&&(a[0]&&o.rotateX(a[0]),a[1]&&o.rotateY(a[1]),a[2]&&o.rotateZ(a[2])),o.translate(n,r,i),qe(o,t);for(let e of Object.keys(o.attributes))[`position`,`normal`,`color`].includes(e)||o.deleteAttribute(e);return o}function Je(e,t,[n=0,r=0,i=0]=[]){let a=e.index?e.toNonIndexed():e;a.translate(n,r,i),qe(a,t);for(let e of Object.keys(a.attributes))[`position`,`normal`,`color`,`uv`].includes(e)||a.deleteAttribute(e);return a}var W=e=>We(e,!1),G=(e,t,n)=>new T(e,t,n),Ye=(e,t,n,r=12)=>new le(e,t,n,r);function Xe(e,t){let n=Ye(e,e,t,12);return n.rotateZ(Math.PI/2),n}function K(e,t,n,r=[1,1]){let i=document.createElement(`canvas`);i.width=e,i.height=t,n(i.getContext(`2d`),e,t);let a=new M(i);return a.colorSpace=C,a.wrapS=a.wrapT=S,a.repeat.set(...r),a.anisotropy=4,a}function Ze(){return K(64,64,(e,t,n)=>{e.fillStyle=`#e9e9e9`,e.fillRect(0,0,t,n);for(let r=0;r<t;r+=4)e.fillStyle=r%8?`#cfcfcf`:`#f7f7f7`,e.fillRect(r,0,2,n);e.fillStyle=`#a9a9a9`,e.fillRect(0,0,t,3),e.fillRect(0,n-3,t,3)})}function Qe(e,t,n,r,i){let a=Ke(i);return K(128,128,(i,o,s)=>{i.fillStyle=t,i.fillRect(0,0,o,s);for(let t=2;t<s;t+=16)for(let s=2;s<o;s+=16)i.fillStyle=r&&a()>.4?n:e,i.fillRect(s,t,13,13),r||(i.fillStyle=`rgba(255,255,255,0.18)`,i.fillRect(s,t,13,4))})}function $e(e,t){return K(128,64,(n,r,i)=>{n.fillStyle=e,n.fillRect(0,0,r,i);for(let e=6;e<r;e+=30){n.fillStyle=t,n.fillRect(e,18,22,46);for(let t=20;t<i;t+=4)n.fillStyle=`rgba(0,0,0,0.18)`,n.fillRect(e,t,22,1)}})}function et(e,t){return K(128,128,(n,r,i)=>{n.fillStyle=e,n.fillRect(0,0,r,i),n.fillStyle=t;for(let e=0;e<=r;e+=16)n.fillRect(e,8,2,40),n.fillRect(e,80,2,40);n.fillRect(0,62,r,2)})}function tt(e,t){return K(256,128,(n,r,i)=>{n.fillStyle=e,n.fillRect(0,0,r,i);for(let e=0;e<400;e++)n.fillStyle=`rgba(0,0,0,${Math.random()*.05})`,n.fillRect(Math.random()*r,Math.random()*i,3,3);n.fillStyle=t;for(let e=20;e<i;e+=34)for(let t=0;t<r;t+=24)n.fillRect(t,e,14,2);n.fillRect(0,i-6,r,3)})}function nt(e,t){return K(64,64,(n,r,i)=>{n.fillStyle=t,n.fillRect(0,0,r,i);for(let t=1;t<i;t+=8)for(let i=1;i<r;i+=8)n.fillStyle=e,n.fillRect(i,t,7,7)})}function rt(e,t,n,r){let i=new E;return i.moveTo(-e*.85,t),i.quadraticCurveTo(-e,t,-e,t+.06),i.lineTo(-e,r),i.quadraticCurveTo(-e*.92,n-.06,0,n),i.quadraticCurveTo(e*.92,n-.06,e,r),i.lineTo(e,t+.06),i.quadraticCurveTo(e,t,e*.85,t),i.closePath(),i}function it(e){let t=[],n=new O(rt(.16,-.6,.62,.3),{depth:.07,bevelEnabled:!1});n.rotateX(-Math.PI/2),n.translate(0,-.05,0);let r=new O(rt(.17,-.6,.64,.3),{depth:.1,bevelEnabled:!1});r.rotateX(-Math.PI/2),r.translate(0,.02,0),t.push(U(n,e.antifoul),U(r,e.hull)),t.push(U(G(.345,.012,.95),e.boot,[0,.025,-.02])),t.push(U(G(.3,.01,1),e.deck,[0,.122,0])),t.push(U(G(.3,.05,.14),e.hull,[0,.14,.5])),t.push(U(G(.18,.012,.1),e.boot,[0,.168,.53]));for(let n=0;n<5;n++)t.push(U(G(.25,.042,.12),e.bridge,[0,.15+n*.042,-.47])),t.push(U(G(.252,.012,.122),e.window,[0,.16+n*.042,-.47]));t.push(U(G(.36,.02,.06),e.bridge,[0,.36,-.45])),t.push(U(G(.362,.01,.062),e.window,[0,.35,-.45])),t.push(U(Ye(.006,.006,.14,6),e.bridge,[0,.44,-.47])),t.push(U(G(.06,.006,.006),e.bridge,[0,.48,-.47])),t.push(U(G(.1,.12,.07),e.funnel,[0,.33,-.55])),t.push(U(G(.102,.025,.072),e.funnelTop,[0,.4,-.55]));for(let n=0;n<8;n++)t.push(U(G(.29,.012,.004),e.deck,[0,.13,-.33+n*.105]));return W(t)}function at(e,t=7){let n=Ke(t),r=[e.box1,e.box2,e.box3,e.box4,e.box5,e.box6||e.box1],i=[];for(let e=0;e<8;e++){let t=2+Math.floor(n()*3);for(let a=0;a<4;a++)for(let o=0;o<t-+(a===0||a===3);o++)i.push(Je(G(.064,.058,.098),r[Math.floor(n()*r.length)],[-.099+a*.066,.158+o*.06,-.33+e*.105+.052]))}return W(i)}function ot(e){let t=[],n=new E;n.moveTo(.16,.06),n.lineTo(.315,.06),n.lineTo(.315,.15),n.lineTo(.295,.245),n.quadraticCurveTo(.29,.262,.27,.262),n.lineTo(.175,.262),n.lineTo(.16,.25),n.closePath();let r=new O(n,{depth:.15,bevelEnabled:!0,bevelThickness:.004,bevelSize:.004,bevelSegments:1});r.rotateY(-Math.PI/2),r.translate(.075,0,0),t.push(U(r,e.cabBody));let i=G(.142,.075,.004);i.rotateX(-.2),t.push(U(i,e.window,[0,.21,.302])),t.push(U(G(.003,.05,.06),e.window,[.077,.215,.24]),U(G(.003,.05,.06),e.window,[-.077,.215,.24])),t.push(U(G(.11,.06,.004),e.grille,[0,.1,.318])),t.push(U(G(.158,.022,.012),e.chrome,[0,.065,.322])),t.push(U(G(.158,.012,.1),e.cabStripe,[0,.15,.24])),t.push(U(G(.02,.06,.02),e.cabBody,[.06,.29,.18]),U(G(.02,.06,.02),e.cabBody,[-.06,.29,.18])),t.push(U(Ye(.022,.022,.07,10),e.chrome,[.085,.07,.12],[0,0,Math.PI/2])),t.push(U(G(.1,.02,.62),e.chassis,[0,.04,-.01])),t.push(U(G(.12,.012,.06),e.chassis,[0,.06,.1]));for(let[n,r]of[[-.07,.25],[.07,.25],[-.07,.11],[.07,.11],[-.07,.06],[.07,.06],[-.07,-.17],[.07,-.17],[-.07,-.23],[.07,-.23]])t.push(U(Xe(.034,.028),e.tyre,[n,.034,r]),U(Xe(.018,.03),e.chrome,[n,.034,r]));return W(t)}function st(e,t){return W([Je(G(.15,.15,.42),t||e.box1,[0,.135,-.07])])}function q(e,t,n){(0,V.useEffect)(()=>{if(!e.current)return;let r=new D;t.forEach((t,i)=>{n(r,t,i),r.updateMatrix(),e.current.setMatrixAt(i,r.matrix)}),e.current.instanceMatrix.needsUpdate=!0,e.current.instanceColor&&(e.current.instanceColor.needsUpdate=!0)},[t])}function ct({C:e,seed:t=11,detail:n=1}){let r=e.night,i=(0,V.useMemo)(()=>({glass:Qe(e.glass,e.mullion,e.windowLit,r,t),glassTall:Qe(e.glassDark,e.mullion,e.windowLit,r,t+3),doors:$e(e.wallLight,e.door),park:et(e.asphalt,e.laneMark),solar:nt(e.solar,e.mullion),corr:Ze()}),[e,t,r]);for(let e of[i.glass,i.glassTall])e.repeat.set(3,1);i.park.repeat.set(2,1),i.solar.repeat.set(6,3);let a=(0,V.useRef)([]);j(({clock:e})=>a.current.forEach((t,n)=>{if(!t)return;let r=(e.elapsedTime*.25+n*.5)%1;t.position.y=.95+r*1.1,t.scale.setScalar(.18+r*.4),t.material.opacity=.45*(1-r)}));let s=(0,V.useRef)(),c=(0,V.useRef)(),l=(0,V.useRef)(),u=(0,V.useRef)(),d=(0,V.useRef)(),f=(0,V.useMemo)(()=>{let e=Ke(t+9),n=[];for(let t=0;t<26;t++)n.push([-1.75+t%13*.125,t<13?.82:1.18,Math.floor(e()*6)]);return n},[t]),h=(0,V.useMemo)(()=>{let e=Ke(t+4),n=[];for(let t=0;t<36;t++){let r=t%4,i=e();n.push(r===0?[-1.95+i*3.9,-1.42]:r===1?[-1.95+i*3.9,1.45]:r===2?[-1.95,-1.3+i*2.6]:[1.95,-1.3+i*2.6])}return n},[t]),g=(0,V.useMemo)(()=>[[-1.9,.62],[-1.1,.62],[-.3,.62],[.5,.62],[1.3,.62]],[]),_=(0,V.useMemo)(()=>[e.box5,e.box1,e.box3,e.mullion,e.wallLight,e.box4].map(e=>new p(e)),[e]);q(s,f,(e,[t,n,r],i)=>{e.position.set(t,.035,n),e.rotation.set(0,0,0),e.scale.set(1,1,1),s.current.setColorAt(i,_[r])}),q(c,h,(e,[t,n],r)=>{e.position.set(t,.12,n),e.scale.setScalar(.8+r%3*.2)}),q(l,g,(e,[t,n])=>{e.position.set(t,.26,n)});let v=(0,V.useMemo)(()=>[0,1,2].map(e=>[1.55,-.62+e*.32]),[]);q(u,v,(e,[t,n])=>{e.position.set(t+.25,0,n),e.rotation.set(0,Math.PI/2,0),e.scale.setScalar(.9)}),q(d,v,(e,[t,n])=>{e.position.set(t+.25,0,n),e.rotation.set(0,Math.PI/2,0),e.scale.setScalar(.9)});let y=(0,V.useMemo)(()=>ot(e),[e]),b=(0,V.useMemo)(()=>st(e,e.box5),[e]),x=(0,V.useMemo)(()=>new p(e.lamp).multiplyScalar(r?4:1.1),[e,r]),S=(0,V.useMemo)(()=>new p(e.late).multiplyScalar(r?3:1.2),[e,r]),C=(0,V.useMemo)(()=>new m([.24,.2,.15,.13,.135,.15].map((e,t)=>new o(e,t*.17)),24),[]);return(0,H.jsxs)(`group`,{children:[(0,H.jsxs)(`mesh`,{position:[0,.006,0],receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[4.1,.012,3]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.concrete,roughness:.95})]}),(0,H.jsxs)(`mesh`,{position:[-1,.014,1],receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[1.75,.004,.62]}),(0,H.jsx)(`meshStandardMaterial`,{map:i.park,roughness:.9})]}),(0,H.jsxs)(`mesh`,{position:[0,.013,.6],receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[4,.004,.16]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.asphalt})]}),(0,H.jsxs)(`mesh`,{position:[1.45,.013,0],receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.16,.004,2.8]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.asphalt})]}),(0,H.jsxs)(`mesh`,{position:[-.35,.25,-.45],castShadow:!0,receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[2.3,.5,1.1]}),(0,H.jsx)(`meshStandardMaterial`,{map:i.glass,emissiveMap:r?i.glass:null,emissive:e.windowLit,emissiveIntensity:r?.55:0,roughness:.25,metalness:.4})]}),(0,H.jsxs)(`mesh`,{position:[-.35,.505,-.45],castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[2.34,.02,1.14]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.roofWhite,roughness:.6})]}),n>0&&[0,1,2,3].map(e=>(0,H.jsxs)(`mesh`,{position:[-1.1+e*.42,.53,-.62],rotation:[-.35,0,0],castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.38,.01,.34]}),(0,H.jsx)(`meshStandardMaterial`,{map:i.solar,roughness:.25,metalness:.6})]},e)),n>0&&[[-1.2,-.15],[-.75,-.18],[-.3,-.15],[.15,-.18]].map(([t,n],r)=>(0,H.jsxs)(`mesh`,{position:[t,.55,n],castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.16,.07,.14]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.hvac,metalness:.5,roughness:.4})]},r)),(0,H.jsxs)(`mesh`,{position:[.95,.55,-.85],castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.55,1.1,.45]}),(0,H.jsx)(`meshStandardMaterial`,{map:i.glassTall,emissiveMap:r?i.glassTall:null,emissive:e.windowLit,emissiveIntensity:r?.7:0,roughness:.15,metalness:.5})]}),(0,H.jsxs)(`mesh`,{position:[.95,1.12,-.85],children:[(0,H.jsx)(`boxGeometry`,{args:[.57,.03,.47]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.roofWhite})]}),(0,H.jsxs)(`mesh`,{position:[.95,.98,-.62],children:[(0,H.jsx)(`boxGeometry`,{args:[.36,.08,.01]}),(0,H.jsx)(`meshBasicMaterial`,{color:new p(e.sign).multiplyScalar(r?2.2:1),toneMapped:!1})]}),(0,H.jsxs)(`mesh`,{position:[1.25,.2,-.3],castShadow:!0,receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.55,.4,1.1]}),(0,H.jsx)(`meshStandardMaterial`,{map:i.doors,roughness:.7})]}),(0,H.jsxs)(`mesh`,{position:[1.25,.41,-.3],children:[(0,H.jsx)(`boxGeometry`,{args:[.58,.02,1.13]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.roof})]}),(0,H.jsx)(`instancedMesh`,{ref:u,args:[y,null,v.length],castShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,roughness:.45,metalness:.25})}),(0,H.jsx)(`instancedMesh`,{ref:d,args:[b,null,v.length],castShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,map:i.corr,roughness:.6,metalness:.2})}),[[-1.65,.25],[-1.25,.3]].map(([t,n],r)=>(0,H.jsxs)(`group`,{position:[t,0,n],children:[(0,H.jsx)(`mesh`,{geometry:C,castShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{color:e.tank,roughness:.8,side:2})}),(0,H.jsxs)(`mesh`,{ref:e=>a.current[r]=e,position:[0,.95,0],children:[(0,H.jsx)(`sphereGeometry`,{args:[1,12,12]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.steam,transparent:!0,depthWrite:!1})]})]},r)),[[.3,.2],[.55,.2]].map(([t,n],r)=>(0,H.jsxs)(`group`,{position:[t,0,n],children:[(0,H.jsxs)(`mesh`,{position:[0,.6,0],castShadow:!0,children:[(0,H.jsx)(`cylinderGeometry`,{args:[.04,.065,1.2,14]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.stack})]}),[.85,1.05].map(t=>(0,H.jsxs)(`mesh`,{position:[0,t,0],children:[(0,H.jsx)(`cylinderGeometry`,{args:[.047,.05,.07,14]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.stackBand})]},t)),(0,H.jsxs)(`mesh`,{position:[0,1.21,0],children:[(0,H.jsx)(`cylinderGeometry`,{args:[.042,.042,.03,14]}),(0,H.jsx)(`meshBasicMaterial`,{color:S,toneMapped:!1})]})]},r)),[[.95,.25],[1.15,.25]].map(([t,n],r)=>(0,H.jsxs)(`group`,{position:[t,0,n],children:[(0,H.jsxs)(`mesh`,{position:[0,.16,0],castShadow:!0,children:[(0,H.jsx)(`cylinderGeometry`,{args:[.09,.09,.32,18]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.tank,metalness:.6,roughness:.3})]}),(0,H.jsxs)(`mesh`,{position:[0,.32,0],children:[(0,H.jsx)(`sphereGeometry`,{args:[.09,18,8,0,Math.PI*2,0,Math.PI/2]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.tank,metalness:.6,roughness:.3})]})]},r)),(0,H.jsxs)(`instancedMesh`,{ref:s,args:[null,null,f.length],castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.06,.04,.11]}),(0,H.jsx)(`meshStandardMaterial`,{roughness:.35,metalness:.5})]}),(0,H.jsxs)(`instancedMesh`,{ref:c,args:[null,null,h.length],castShadow:!0,children:[(0,H.jsx)(`icosahedronGeometry`,{args:[.09,0]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.tree1,flatShading:!0,roughness:.9})]}),(0,H.jsxs)(`instancedMesh`,{ref:l,args:[null,null,g.length],children:[(0,H.jsx)(`sphereGeometry`,{args:[.025,8,8]}),(0,H.jsx)(`meshBasicMaterial`,{color:x,toneMapped:!1})]}),[[0,-1.5,4.1,.004],[0,1.5,4.1,.004],[-2.05,0,.004,3],[2.05,0,.004,3]].map(([t,n,r,i],a)=>(0,H.jsxs)(`mesh`,{position:[t,.05,n],children:[(0,H.jsx)(`boxGeometry`,{args:[r,.09,i]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.fence,transparent:!0,opacity:.7})]},a))]})}function lt(e){let t=[],n=e.crane,r=e.craneWhite;for(let r of[-.22,.22]){t.push(U(G(.05,1.05,.05),n,[r,.525,-.25]),U(G(.05,1.05,.05),n,[r,.525,.25])),t.push(U(G(.04,.04,.55),n,[r,.5,0]),U(G(.05,.05,.55),n,[r,1.05,0]));let i=G(.025,.7,.025);i.rotateX(.62),t.push(U(i,n,[r,.75,0])),t.push(U(G(.07,.03,.14),e.chassis,[r,.015,-.25]),U(G(.07,.03,.14),e.chassis,[r,.015,.25]))}t.push(U(G(.5,.05,.05),n,[0,1.05,-.25]),U(G(.5,.05,.05),n,[0,1.05,.25])),t.push(U(G(.12,.06,2.6),n,[0,1.12,.55])),t.push(U(G(.04,.5,.04),n,[0,1.38,-.15]));let i=G(.015,.012,1.1);i.rotateX(.42),t.push(U(i,r,[0,1.38,.35]));let a=G(.015,.012,.8);return a.rotateX(-.55),t.push(U(a,r,[0,1.38,-.45])),t.push(U(G(.24,.12,.3),r,[0,1.21,-.35])),t.push(U(G(.1,.05,.08),r,[0,1.06,.9])),t.push(U(G(.006,.42,.006),e.chassis,[.03,.83,.9]),U(G(.006,.42,.006),e.chassis,[-.03,.83,.9])),t.push(U(G(.08,.02,.14),e.box2,[0,.61,.9])),W(t)}function ut(e){let t=[],n=e.rtg;for(let[e,r]of[[-.42,-.12],[.42,-.12],[-.42,.12],[.42,.12]])t.push(U(G(.035,.42,.035),n,[e,.21,r]));return t.push(U(G(.9,.04,.04),n,[0,.43,-.12]),U(G(.9,.04,.04),n,[0,.43,.12])),t.push(U(G(.12,.06,.28),e.craneWhite,[.1,.46,0])),W(t)}function dt({C:e,shipHull:t,shipCargo:n,detail:r=1}){let i=e.night,a=(0,V.useMemo)(()=>({apron:tt(e.concrete,e.apronMark),corr:Ze(),doors:$e(e.wallLight,e.door)}),[e]);a.apron.repeat.set(3,2);let o=(0,V.useMemo)(()=>lt(e),[e]),s=(0,V.useMemo)(()=>ut(e),[e]),c=(0,V.useRef)(),l=(0,V.useRef)(),u=(0,V.useRef)(),d=(0,V.useMemo)(()=>{let e=Ke(5),t=[];for(let n=0;n<4;n++)for(let r=0;r<3;r++)for(let i=0;i<9;i++){let a=1+Math.floor(e()*4);for(let o=0;o<a;o++)t.push([-2.7+n*1.25+i*.12,-1.2+r*.22,o,Math.floor(e()*6)])}for(let n=0;n<18;n++)t.push([-2.2+n*.26,.55+n%2*.16,0,Math.floor(e()*6)]);return t},[]),f=(0,V.useMemo)(()=>[e.box1,e.box2,e.box3,e.box4,e.box5,e.box6||e.box1].map(e=>new p(e)),[e]);q(c,d,(e,[t,n,r,i],a)=>{e.position.set(t,.05+r*.08,n),e.rotation.set(0,Math.PI/2,0),c.current.setColorAt(a,f[i])});let m=(0,V.useMemo)(()=>[[-2.2,-.98],[-.95,-.98],[.3,-.98],[1.55,-.98]],[]);q(l,m,(e,[t,n])=>{e.position.set(t,.02,n),e.rotation.set(0,Math.PI/2,0)});let h=(0,V.useMemo)(()=>[[-3,.2],[-1,.2],[1,.2],[3,.2],[-3,-1.6],[3,-1.6]],[]);q(u,h,(e,[t,n])=>{e.position.set(t,.85,n)});let g=(0,V.useMemo)(()=>new p(e.lamp).multiplyScalar(i?4:1.1),[e,i]);return(0,H.jsxs)(`group`,{children:[(0,H.jsxs)(`mesh`,{position:[0,-.03,0],receiveShadow:!0,castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[6.6,.1,3.6]}),(0,H.jsx)(`meshStandardMaterial`,{map:a.apron,roughness:.9})]}),(0,H.jsxs)(`mesh`,{position:[0,.025,1.78],children:[(0,H.jsx)(`boxGeometry`,{args:[6.6,.02,.05]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.quayEdge})]}),[-2.6,-1.3,0,1.3,2.6].map(t=>(0,H.jsxs)(`mesh`,{position:[t,.05,1.79],children:[(0,H.jsx)(`cylinderGeometry`,{args:[.025,.03,.06,8]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.chassis})]},t)),(0,H.jsxs)(`instancedMesh`,{ref:c,args:[null,null,d.length],castShadow:!0,receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.2,.075,.1]}),(0,H.jsx)(`meshStandardMaterial`,{map:a.corr,roughness:.6,metalness:.25})]}),(0,H.jsx)(`instancedMesh`,{ref:l,args:[s,null,m.length],castShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,roughness:.5,metalness:.3})}),[-2.2,-.9,.4,1.7].map(e=>(0,H.jsx)(`mesh`,{geometry:o,position:[e,.02,1.35],castShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,roughness:.45,metalness:.35})},e)),r>0&&[[2.75,-.9],[2.75,.2]].map(([t,n],r)=>(0,H.jsxs)(`group`,{children:[(0,H.jsxs)(`mesh`,{position:[t,.17,n],castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.9,.34,.8]}),(0,H.jsx)(`meshStandardMaterial`,{map:a.doors,roughness:.7})]}),(0,H.jsxs)(`mesh`,{position:[t,.355,n],children:[(0,H.jsx)(`boxGeometry`,{args:[.94,.03,.84]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.roof})]})]},r)),h.map(([t,n],r)=>(0,H.jsxs)(`mesh`,{position:[t,.42,n],children:[(0,H.jsx)(`cylinderGeometry`,{args:[.012,.018,.84,6]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.pole})]},r)),(0,H.jsxs)(`instancedMesh`,{ref:u,args:[null,null,h.length],children:[(0,H.jsx)(`boxGeometry`,{args:[.1,.03,.05]}),(0,H.jsx)(`meshBasicMaterial`,{color:g,toneMapped:!1})]}),t&&(0,H.jsxs)(`group`,{position:[.2,0,2.2],"rotation-y":Math.PI/2,scale:2.4,children:[(0,H.jsx)(`mesh`,{geometry:t,castShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,roughness:.5,metalness:.2})}),(0,H.jsx)(`mesh`,{geometry:n,castShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,map:a.corr,roughness:.6,metalness:.2})})]})]})}ie({Water:ye});var J={"IN-TN-01":[3.6,-1.6],"IN-KA-01":[-3.8,-2.6],PORT:[.6,6.2],"SUP-004":[8.6,1.4],"SUP-005":[-11,-4.6],"SUP-007":[-7.6,2.4],"SUP-008":[-9.4,5],"SUP-001":[-13,12.5],"SUP-002":[-6.5,14.5],"SUP-003":[.5,15.5],"SUP-006":[7.5,14.5],"SUP-009":[13.5,12.5],"SUP-010":[17.5,6.5]},ft=new Set([`SUP-001`,`SUP-002`,`SUP-003`,`SUP-006`,`SUP-009`,`SUP-010`]),Y=.3;function pt(e){let t=e;return()=>(t=t*16807%2147483647)/2147483647}var X=(e,t,n)=>{let r=Math.max(0,Math.min(1,(n-e)/(t-e)));return r*r*(3-2*r)},mt=Object.values(J);function ht(e,t){let n=Math.atan2(t+1,e),r=1+(.05*Math.sin(n*5)+.03*Math.sin(n*11+1))-Math.hypot(e/15.5,(t+1)/9);for(let n of ft){let[i,a]=J[n];r=Math.max(r,.55*(1-Math.hypot(e-i,t-a)/2.1))}return r}var gt=(e,t)=>Math.sin(e*.45+1.3)*Math.cos(t*.5-.7)*.5+Math.sin(e*1.1+t*.8)*.28+Math.sin(e*.23-t*.31+2)*.3;function Z(e,t){let n=ht(e,t),r=X(0,.1,n),i=99;for(let[n,r]of mt)i=Math.min(i,Math.hypot(e-n,t-r));let a=X(.18,.5,n)*X(2.4,5,i)*Math.max(0,gt(e,t))*1.25;return-.35+r*.6499999999999999+a}var _t=([e,t],n=.05)=>new u(e,Math.max(Z(e,t),Y)+n,t);function vt(e,t,n=.18){let r=_t(e),i=_t(t),a=r.clone().lerp(i,.5),o=i.clone().sub(r);a.add(new u(-o.z,0,o.x).normalize().multiplyScalar(o.length()*n));let s=new y([r,a,i]).getPoints(40).map(e=>new u(e.x,Math.max(Z(e.x,e.z),Y)+.05,e.z));return new y(s)}function yt(e,t){let n=new u(e[0],.04,e[1]-1.5),r=new u(t[0]+1.6,.04,t[1]+2.6);return new y([n,new u(n.x*.6+r.x*.4,.04,n.z*.5+r.z*.5+1.2),r])}function bt(e){let t={};for(let n of e){let e=J[n.supplier_id],r=J[n.plant_id];e&&r&&(t[n.id]=ft.has(n.supplier_id)?{sea:yt(e,J.PORT),road:vt(J.PORT,r,.12),mode:`SEA`}:{road:vt(e,r,n.supplier_id.charCodeAt(6)%2?.16:-.16),mode:`ROAD`})}return t}function Q(e,t,[n=0,r=0,i=0]=[]){let a=e.index?e.toNonIndexed():e;a.translate(n,r,i);let o=new p(t),s=a.attributes.position.count,c=new Float32Array(s*3);for(let e=0;e<s;e++)c[e*3]=o.r,c[e*3+1]=o.g,c[e*3+2]=o.b;a.setAttribute(`color`,new w(c,3));for(let e of Object.keys(a.attributes))[`position`,`normal`,`color`].includes(e)||a.deleteAttribute(e);return a}var xt=e=>We(e,!1);function St(e){let t=new E;t.moveTo(-.17,-.55),t.lineTo(.17,-.55),t.lineTo(.17,.32),t.quadraticCurveTo(.12,.5,0,.6),t.quadraticCurveTo(-.12,.5,-.17,.32),t.closePath();let n=new O(t,{depth:.13,bevelEnabled:!1});n.rotateX(-Math.PI/2),n.translate(0,-.03,0);let r=new O(t,{depth:.012,bevelEnabled:!1});r.rotateX(-Math.PI/2),r.translate(0,.1,0);let i=[Q(n,e.hull),Q(new T(.345,.03,.9),e.hullStripe,[0,.005,-.08]),Q(r,e.deck)],a=[e.box1,e.box2,e.box3,e.box4,e.box5],o=0;for(let e=0;e<5;e++)for(let t=0;t<2;t++)for(let n=0;n<2+(e+t)%2;n++)i.push(Q(new T(.135,.065,.13),a[(o++*7+e)%5],[t?.072:-.072,.15+n*.068,-.28+e*.15]));return i.push(Q(new T(.3,.16,.13),e.bridge,[0,.19,-.46])),i.push(Q(new T(.31,.03,.135),e.window,[0,.235,-.46])),i.push(Q(new T(.22,.05,.1),e.bridge,[0,.29,-.46])),i.push(Q(new le(.035,.04,.14,10),e.funnel,[.06,.33,-.52])),xt(i)}function Ct(e){let t=[Q(new T(.15,.15,.36),e.trailer,[0,.12,-.08]),Q(new T(.152,.025,.362),e.trailerStripe,[0,.07,-.08]),Q(new T(.15,.13,.12),e.cab,[0,.105,.19]),Q(new T(.152,.05,.03),e.window,[0,.14,.25]),Q(new T(.11,.02,.5),e.chassis,[0,.04,.02])];for(let[n,r]of[[-.075,.18],[.075,.18],[-.075,-.02],[.075,-.02],[-.075,-.16],[.075,-.16]]){let i=new le(.035,.035,.03,10);i.rotateZ(Math.PI/2),t.push(Q(i,e.tyre,[n,.035,r]))}return xt(t)}function wt(e,t,n,r,i){let a=document.createElement(`canvas`);a.width=64,a.height=128;let o=a.getContext(`2d`),s=pt(r);o.fillStyle=e,o.fillRect(0,0,64,128);for(let e=6;e<122;e+=12)for(let r=5;r<59;r+=10)o.fillStyle=i?s()>.45?t:n:s()>.85?t:n,o.fillRect(r,e,6,7);let c=new M(a);return c.colorSpace=C,c.wrapS=c.wrapT=S,c}function Tt(){let e=document.createElement(`canvas`);e.width=64,e.height=256;let t=e.getContext(`2d`),n=t.createLinearGradient(0,0,0,256);return n.addColorStop(0,`rgba(255,255,255,0.9)`),n.addColorStop(1,`rgba(255,255,255,0)`),t.fillStyle=n,t.beginPath(),t.moveTo(26,0),t.lineTo(38,0),t.lineTo(64,256),t.lineTo(0,256),t.closePath(),t.fill(),new M(e)}function Et({title:e,sub:t,dot:n,bg:r,ink:i,muted:a,pin:o}){let s=o?150:132,c=document.createElement(`canvas`);c.width=520,c.height=s;let l=c.getContext(`2d`);l.fillStyle=r,l.beginPath(),l.roundRect(4,4,512,s-8,22),l.fill(),l.lineWidth=3,l.strokeStyle=n,l.globalAlpha=.6,l.stroke(),l.globalAlpha=1,o?(l.fillStyle=n,l.beginPath(),l.arc(52,s/2-8,22,Math.PI,0),l.lineTo(52,s/2+34),l.closePath(),l.fill(),l.fillStyle=r,l.beginPath(),l.arc(52,s/2-8,9,0,Math.PI*2),l.fill()):(l.fillStyle=n,l.beginPath(),l.arc(46,s/2,17,0,Math.PI*2),l.fill());let u=o?96:82;l.fillStyle=i,l.font=`700 46px Inter, system-ui, sans-serif`,l.fillText(e,u,s/2-(t?4:-14),520-u-16),t&&(l.fillStyle=a,l.font=`600 36px Inter, system-ui, sans-serif`,l.fillText(t,u,s/2+40,520-u-16));let d=new M(c);return d.colorSpace=C,d.anisotropy=4,{t:d,aspect:520/s}}function Dt({position:e,scale:t=.03,center:n=[.5,0],spriteRef:r,...i}){let{t:a,aspect:o}=(0,V.useMemo)(()=>Et(i),[i.title,i.sub,i.dot,i.bg,i.ink,i.muted,i.pin]);return(0,H.jsx)(`sprite`,{ref:r,position:e,scale:[t*o,t,1],center:n,renderOrder:20,children:(0,H.jsx)(`spriteMaterial`,{map:a,transparent:!0,depthTest:!1,sizeAttenuation:!1,toneMapped:!1})})}function Ot({C:e}){let t=(0,V.useRef)(),n=b(ue,`/env/waternormals.jpg`);n.wrapS=n.wrapT=S;let r=(0,V.useMemo)(()=>[new x(220,220),{textureWidth:512,textureHeight:512,waterNormals:n,sunDirection:new u(.5,.6,.4).normalize(),sunColor:new p(e.sun),waterColor:new p(e.water),distortionScale:e.night?1.4:2.2,fog:!0,alpha:1}],[n,e.water,e.sun,e.night]),i=(0,V.useMemo)(()=>{let e=n.clone();return e.wrapS=e.wrapT=S,e.repeat.set(26,26),e.needsUpdate=!0,e},[n]);return j((n,r)=>{t.current?.material?.uniforms&&(t.current.material.uniforms.time.value+=r*.35),e.night&&(i.offset.x+=r*.006,i.offset.y+=r*.004)}),(0,V.useEffect)(()=>{t.current?.material?.uniforms&&(t.current.material.uniforms.size.value=3.2)},[r]),e.night?(0,H.jsxs)(`mesh`,{"rotation-x":-Math.PI/2,receiveShadow:!0,children:[(0,H.jsx)(`planeGeometry`,{args:[220,220]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.water,metalness:.55,roughness:.18,normalMap:i,normalScale:[.55,.55],envMapIntensity:1.6})]}):(0,H.jsx)(`water`,{ref:t,args:r,"rotation-x":-Math.PI/2,position:[0,0,0]})}function kt({C:e}){let t=(0,V.useMemo)(()=>{let t=new x(46,32,230,160);t.rotateX(-Math.PI/2),t.translate(2,0,4.5);let n=t.attributes.position,r=new Float32Array(n.count*3),i=new p(e.sand),a=new p(e.grass),o=new p(e.hill),s=new p(e.seabed),c=new p;for(let e=0;e<n.count;e++){let t=n.getX(e),l=n.getZ(e),u=Z(t,l);n.setY(e,u),u<.02?c.copy(s).lerp(i,X(-.3,.02,u)):u<.27999999999999997?c.copy(i):c.copy(a).lerp(o,X(.35,1.2,u)),c.offsetHSL(0,0,Math.sin(t*3.1)*Math.cos(l*2.7)*.015),r.set([c.r,c.g,c.b],e*3)}return t.setAttribute(`color`,new w(r,3)),t.computeVertexNormals(),t},[e]);return(0,H.jsx)(`mesh`,{geometry:t,receiveShadow:!0,castShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,roughness:.95,metalness:0})})}function At({C:e}){let t=(0,V.useRef)(),n=(0,V.useRef)(),r=(0,V.useMemo)(()=>{let e=pt(42),t=[],n=0;for(;t.length<900&&n++<2e4;){let n=(e()-.5)*34+1,r=(e()-.5)*20-1,i=Z(n,r),a=99;for(let[e,t]of mt)a=Math.min(a,Math.hypot(n-e,r-t));i>.29&&a>1.9&&ht(n,r)>.08&&t.push([n,i,r,.55+e()*.6,e()])}return t},[]);return(0,V.useEffect)(()=>{let i=new D,a=[new p(e.tree1),new p(e.tree2),new p(e.tree3)];r.forEach(([e,r,o,s,c],l)=>{i.position.set(e,r+.06*s,o),i.scale.setScalar(s),i.rotation.set(0,c*6,0),i.updateMatrix(),t.current.setMatrixAt(l,i.matrix),i.position.set(e,r+.2*s,o),i.updateMatrix(),n.current.setMatrixAt(l,i.matrix),n.current.setColorAt(l,a[Math.min(2,Math.floor(c*3))])}),t.current.instanceMatrix.needsUpdate=n.current.instanceMatrix.needsUpdate=!0,n.current.instanceColor&&(n.current.instanceColor.needsUpdate=!0)},[r,e]),(0,H.jsxs)(`group`,{children:[(0,H.jsxs)(`instancedMesh`,{ref:t,args:[null,null,r.length],castShadow:!0,children:[(0,H.jsx)(`cylinderGeometry`,{args:[.02,.025,.12,5]}),(0,H.jsx)(`meshStandardMaterial`,{color:e.trunk,roughness:1})]}),(0,H.jsxs)(`instancedMesh`,{ref:n,args:[null,null,r.length],castShadow:!0,children:[(0,H.jsx)(`icosahedronGeometry`,{args:[.13,0]}),(0,H.jsx)(`meshStandardMaterial`,{roughness:.9,flatShading:!0})]})]})}function jt({C:e}){let t=(0,V.useRef)(),n=(0,V.useMemo)(()=>{let e=pt(9),t=[];for(let n of[`IN-TN-01`,`IN-KA-01`]){let[r,i]=J[n];for(let n=0;n<70;n++){let n=e()*Math.PI*2,a=2.3+e()*2.6,o=r+Math.cos(n)*a,s=i+Math.sin(n)*a*.75,c=Z(o,s);c<.29||c>.55||t.push([o,c,s,.18+e()*.2,.2+e()*(a<3.4?.9:.45),.18+e()*.18,e()])}}return t},[]),[r,i]=(0,V.useMemo)(()=>[wt(e.facade,e.windowDay,e.windowDark,3,!1),wt(`#000000`,e.windowLit,`#000000`,3,!0)],[e]);return(0,V.useEffect)(()=>{let e=new D;n.forEach(([n,r,i,a,o,s,c],l)=>{e.position.set(n,r+o/2,i),e.scale.set(a,o,s),e.rotation.set(0,Math.round(c*4)*.39,0),e.updateMatrix(),t.current.setMatrixAt(l,e.matrix)}),t.current.instanceMatrix.needsUpdate=!0},[n]),(0,H.jsxs)(`instancedMesh`,{ref:t,args:[null,null,n.length],castShadow:!0,receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{}),(0,H.jsx)(`meshStandardMaterial`,{map:r,emissiveMap:i,emissive:e.windowLit,emissiveIntensity:e.night?1.6:0,roughness:.7})]})}function Mt(e,t){let n=[],r=[];for(let i=0;i<=90;i++){let a=i/90,o=e.getPointAt(a),s=e.getTangentAt(a),c=new u(-s.z,0,s.x).normalize().multiplyScalar(t/2);for(let e of[-1,1]){let t=o.clone().addScaledVector(c,e);n.push(t.x,Math.max(Z(t.x,t.z),Y)+.03,t.z)}if(i<90){let e=i*2;r.push(e,e+1,e+2,e+1,e+3,e+2)}}let i=new _;return i.setAttribute(`position`,new w(new Float32Array(n),3)),i.setIndex(r),i.computeVertexNormals(),i}function Nt({curve:e,C:t,dim:n}){let r=(0,V.useMemo)(()=>Mt(e,.34),[e]),i=(0,V.useMemo)(()=>[-1,1].map(t=>e.getPoints(90).map((n,r,i)=>{let a=e.getTangentAt(r/(i.length-1)),o=new u(-a.z,0,a.x).normalize().multiplyScalar(.17*t),s=n.clone().add(o);return[s.x,Math.max(Z(s.x,s.z),Y)+.05,s.z]})),[e]),a=(0,V.useMemo)(()=>e.getPoints(90).map(e=>[e.x,Math.max(Z(e.x,e.z),Y)+.045,e.z]),[e]),o=(0,V.useMemo)(()=>new p(t.roadGlow).multiplyScalar(t.night?2.2:1),[t]),s=(0,V.useRef)();return j((e,t)=>{s.current?.material&&(s.current.material.dashOffset-=t*.6)}),(0,H.jsxs)(`group`,{children:[(0,H.jsx)(`mesh`,{geometry:r,receiveShadow:!0,children:(0,H.jsx)(`meshStandardMaterial`,{color:t.asphalt,roughness:.85,side:2,transparent:!0,opacity:n?.5:1})}),i.map((e,r)=>(0,H.jsx)(ze,{points:e,color:o,lineWidth:t.night?1.6:1.1,transparent:!0,opacity:n?.25:.95,toneMapped:!1},r)),(0,H.jsx)(ze,{ref:s,points:a,color:t.laneMark,lineWidth:1,dashed:!0,dashSize:.12,gapSize:.12,transparent:!0,opacity:n?.2:.8})]})}function Pt({curves:e,C:t}){let n=(0,V.useRef)(),r=(0,V.useRef)(),i=(0,V.useMemo)(()=>{let t=[];for(let n of e){let e=n.getLength(),r=Math.floor(e/1.1);for(let e=1;e<r;e++){let i=e/r,a=n.getPointAt(i),o=n.getTangentAt(i),s=new u(-o.z,0,o.x).normalize().multiplyScalar(e%2?.28:-.28),c=a.clone().add(s);t.push([c.x,Math.max(Z(c.x,c.z),Y),c.z])}}return t},[e]);(0,V.useEffect)(()=>{if(!n.current||!r.current)return;let e=new D;i.forEach(([t,i,a],o)=>{e.position.set(t,i+.13,a),e.updateMatrix(),n.current.setMatrixAt(o,e.matrix),e.position.set(t,i+.27,a),e.updateMatrix(),r.current.setMatrixAt(o,e.matrix)}),n.current.instanceMatrix.needsUpdate=r.current.instanceMatrix.needsUpdate=!0},[i]);let a=(0,V.useMemo)(()=>new p(t.lamp).multiplyScalar(t.night?4:1.2),[t]);return i.length?(0,H.jsxs)(`group`,{children:[(0,H.jsxs)(`instancedMesh`,{ref:n,args:[null,null,i.length],children:[(0,H.jsx)(`cylinderGeometry`,{args:[.008,.01,.26,5]}),(0,H.jsx)(`meshStandardMaterial`,{color:t.pole})]}),(0,H.jsxs)(`instancedMesh`,{ref:r,args:[null,null,i.length],children:[(0,H.jsx)(`sphereGeometry`,{args:[.022,8,8]}),(0,H.jsx)(`meshBasicMaterial`,{color:a,toneMapped:!1})]})]}):null}function Ft({curve:e,C:t,dim:n}){let r=(0,V.useMemo)(()=>e.getPoints(80).map(e=>[e.x,.06,e.z]),[e]),i=(0,V.useRef)(),a=(0,V.useMemo)(()=>new p(t.seaRoute).multiplyScalar(t.night?2.4:1.3),[t]);return j((e,t)=>{i.current?.material&&(i.current.material.dashOffset-=t*.9)}),(0,H.jsx)(ze,{ref:i,points:r,color:a,lineWidth:2.4,dashed:!0,dashSize:.35,gapSize:.25,transparent:!0,opacity:n?.25:1,toneMapped:!1})}function It({pos:e,color:t,r:n=1.1,night:r}){let i=(0,V.useRef)(),a=(0,V.useMemo)(()=>new p(t).multiplyScalar(r?2.6:1.4),[t,r]);return j(({clock:t})=>{if(!i.current)return;let n=(t.elapsedTime*.6+e[0])%1;i.current.scale.setScalar(1+n*.7),i.current.material.opacity=.5*(1-n)}),(0,H.jsxs)(`group`,{position:e,children:[(0,H.jsxs)(`mesh`,{rotation:[-Math.PI/2,0,0],children:[(0,H.jsx)(`ringGeometry`,{args:[n,n+.08,72]}),(0,H.jsx)(`meshBasicMaterial`,{color:a,toneMapped:!1})]}),(0,H.jsxs)(`mesh`,{rotation:[-Math.PI/2,0,0],position:[0,-.005,0],children:[(0,H.jsx)(`circleGeometry`,{args:[n,56]}),(0,H.jsx)(`meshBasicMaterial`,{color:t,transparent:!0,opacity:.1,depthWrite:!1})]}),(0,H.jsxs)(`mesh`,{ref:i,rotation:[-Math.PI/2,0,0],children:[(0,H.jsx)(`ringGeometry`,{args:[n,n+.045,72]}),(0,H.jsx)(`meshBasicMaterial`,{color:a,toneMapped:!1,transparent:!0,depthWrite:!1})]})]})}function Lt(e,t){return(0,V.useMemo)(()=>({map:wt(e.facade,e.windowDay,e.windowDark,t,!1),emissive:wt(`#000000`,e.windowLit,`#000000`,t,!0)}),[e,t])}function Rt({args:e,position:t,C:n,tex:r}){return(0,H.jsxs)(`mesh`,{position:t,castShadow:!0,receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:e}),(0,H.jsx)(`meshStandardMaterial`,{map:r.map,emissiveMap:r.emissive,emissive:n.windowLit,emissiveIntensity:n.night?1.4:0,roughness:.6})]})}function zt({id:e,s:t,status:n,C:r,selected:i,dim:a,onClick:o}){let[s,c]=J[e],l=Math.max(Z(s,c),Y),u={HEALTHY:r.ok,WATCH:r.watch,RISK:r.late}[n],d=Lt(r,e.charCodeAt(6));return(0,H.jsxs)(`group`,{onClick:t=>{t.stopPropagation(),o(e)},onPointerOver:()=>document.body.style.cursor=`pointer`,onPointerOut:()=>document.body.style.cursor=`auto`,children:[(0,H.jsxs)(`group`,{position:[s,l,c],scale:i?1.1:1,children:[(0,H.jsxs)(`mesh`,{position:[0,.005,0],receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[1.9,.02,1.4]}),(0,H.jsx)(`meshStandardMaterial`,{color:r.concrete})]}),(0,H.jsx)(Rt,{args:[1,.42,.62],position:[-.15,.21,-.1],C:r,tex:d}),(0,H.jsx)(Rt,{args:[.5,.62,.42],position:[.55,.31,-.18],C:r,tex:d}),(0,H.jsxs)(`mesh`,{position:[-.15,.44,-.1],castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[1.04,.04,.66]}),(0,H.jsx)(`meshStandardMaterial`,{color:r.roof})]}),[[-.45,-.25],[-.1,-.2],[.18,.02]].map(([e,t],n)=>(0,H.jsxs)(`mesh`,{position:[e,.5,t],castShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[.12,.08,.12]}),(0,H.jsx)(`meshStandardMaterial`,{color:r.hvac,metalness:.4,roughness:.4})]},n)),[-.45,-.15,.15].map((e,t)=>(0,H.jsxs)(`mesh`,{position:[e,.12,.215],children:[(0,H.jsx)(`boxGeometry`,{args:[.18,.2,.01]}),(0,H.jsx)(`meshStandardMaterial`,{color:r.door})]},t)),(0,H.jsxs)(`mesh`,{position:[.55,.75,-.18],children:[(0,H.jsx)(`cylinderGeometry`,{args:[.04,.05,.26,10]}),(0,H.jsx)(`meshStandardMaterial`,{color:r.roof})]}),ft.has(e)&&(0,H.jsxs)(`mesh`,{position:[0,-.12,-1.45],castShadow:!0,receiveShadow:!0,children:[(0,H.jsx)(`boxGeometry`,{args:[1.6,.18,.55]}),(0,H.jsx)(`meshStandardMaterial`,{color:r.concrete})]})]}),(0,H.jsx)(It,{pos:[s,l+.03,c],color:u,r:i?1.2:1.02,night:r.night}),!a&&(0,H.jsx)(Dt,{position:[s,l+1.05,c],title:e,sub:`${t?.supplier_name?.split(` `).slice(0,2).join(` `)||``} · ${t?.otif_pct??`–`}%`,dot:u,bg:r.card,ink:r.cardInk,muted:r.cardMuted,scale:i?.034:.028})]})}function Bt({id:e,label:t,C:n,inbound:r}){let[i,a]=J[e],o=Math.max(Z(i,a),Y);return(0,H.jsxs)(`group`,{children:[(0,H.jsx)(`group`,{position:[i,o,a],children:(0,H.jsx)(ct,{C:n,seed:e===`IN-TN-01`?11:17})}),(0,H.jsx)(It,{pos:[i,o+.03,a],color:n.plant,r:2.35,night:n.night}),(0,H.jsx)(Dt,{position:[i,o+2,a],title:t,sub:`${e} · ${r} inbound`,dot:n.plantPin,bg:n.card,ink:n.cardInk,muted:n.cardMuted,pin:!0,scale:.036})]})}function Vt({C:e,inbound:t,shipGeo:n,cargoGeo:r}){let[i,a]=J.PORT;return(0,H.jsxs)(`group`,{children:[(0,H.jsx)(`group`,{position:[i+.2,Y,a+1.4],children:(0,H.jsx)(dt,{C:e,shipHull:n,shipCargo:r})}),(0,H.jsx)(It,{pos:[i+.2,.33999999999999997,a+1.4],color:e.seaRoute,r:3.6,night:e.night}),(0,H.jsx)(Dt,{position:[i-1.6,2,a+.8],title:`Port Hub`,sub:`Chennai port · ${t} ships`,dot:e.plantPin,bg:e.card,ink:e.cardInk,muted:e.cardMuted,pin:!0,scale:.032})]})}var $=160;function Ht(e,t){let n=document.createElement(`canvas`);n.width=n.height=96;let r=n.getContext(`2d`);r.translate(48,48),r.beginPath(),r.arc(0,0,40,0,Math.PI*2),r.fillStyle=e,r.fill(),r.lineWidth=5,r.strokeStyle=t,r.stroke(),r.fillStyle=t,r.beginPath(),r.moveTo(-22,2),r.lineTo(22,2),r.lineTo(15,15),r.lineTo(-15,15),r.closePath(),r.fill(),r.fillRect(-10,-9,8,9),r.fillRect(0,-9,8,9),r.fillRect(-19,-18,7,18);let i=new M(n);return i.colorSpace=C,i}function Ut({data:e,routes:t,simDayRef:n,C:r,filters:i,statusOf:a,selectedSupplier:o,onPick:s,shipGeo:c,cargoGeo:l}){let d=(0,V.useRef)(),f=(0,V.useRef)(),m=(0,V.useRef)(),h=(0,V.useRef)(),g=(0,V.useRef)([]),_=(0,V.useRef)(),v=(0,V.useRef)(),y=(0,V.useMemo)(()=>ot(r),[r]),b=(0,V.useMemo)(()=>st(r,r.box2),[r]),x=(0,V.useMemo)(()=>Ze(),[]),S=(0,V.useMemo)(()=>Tt(),[]),C=(0,V.useRef)({ship:[],truck:[]}),w=(0,V.useMemo)(()=>new D,[]),T=(0,V.useMemo)(()=>new u,[]),E=(0,V.useMemo)(()=>new u,[]),O=(0,V.useMemo)(()=>({ok:Ht(r.ok,r.trailer),late:Ht(r.late,r.trailer),dis:Ht(r.watch,r.trailer)}),[r]),k=(0,V.useMemo)(()=>new p(r.lamp).multiplyScalar(r.night?5:1),[r]);j(({clock:r})=>{if(!d.current||!f.current)return;let s=n.current,c=r.elapsedTime,l=0,u=0,p=0;C.current.ship.length=0,C.current.truck.length=0;for(let n of e.shipments){if(s<n.t_depart||s>=n.t_eta)continue;let e=t[n.lane];if(!e||i.plant&&n.plant_id!==i.plant||!i.status.has(a(n.supplier_id))||i.category&&i.catOf?.[n.material_id]!==i.category)continue;let r=(s-n.t_depart)/Math.max(.01,n.t_eta-n.t_depart),y=e.mode===`SEA`&&r<.85;if(y&&!i.sea||!y&&!i.road)continue;let b=y?e.sea:e.road,x=Math.min(.999,Math.max(0,y?r/.85:e.mode===`SEA`?(r-.85)/.15:r));b.getPointAt(x,T),b.getTangentAt(x,E);let S=Math.atan2(E.x,E.z),D=n.disrupted?`dis`:s>n.t_promised?`late`:`ok`,k=o&&n.supplier_id===o?1.2:1;if(y&&l<$){w.position.set(T.x,.03+Math.sin(c*1.8+n.t_po)*.012,T.z),w.rotation.set(Math.sin(c*1.3+n.t_eta)*.035,S,Math.sin(c*1.1+n.t_po)*.03),w.scale.setScalar(.82*k),w.updateMatrix(),d.current.setMatrixAt(l,w.matrix),_.current.setMatrixAt(l,w.matrix),w.rotation.set(-Math.PI/2,0,-S),w.position.set(T.x-E.x*.75,.012,T.z-E.z*.75),w.scale.set(.3*k,.9*k,1),w.updateMatrix(),m.current.setMatrixAt(l,w.matrix),C.current.ship.push(n.id);let e=g.current[p];e&&p<18&&(e.visible=!0,e.position.set(T.x,.95,T.z),e.material.map=O[D],e.material.needsUpdate=!0,e.userData.id=n.id,p++),l++}else!y&&u<$&&(w.position.set(T.x,T.y-.02+Math.abs(Math.sin(c*9+n.t_po))*.004,T.z),w.rotation.set(0,S,0),w.scale.setScalar(1.25*k),w.updateMatrix(),f.current.setMatrixAt(u,w.matrix),v.current.setMatrixAt(u,w.matrix),w.translateZ(.33),w.translateY(.1),w.updateMatrix(),h.current.setMatrixAt(u,w.matrix),C.current.truck.push(n.id),u++)}d.current.count=m.current.count=_.current.count=l,f.current.count=h.current.count=v.current.count=u;for(let e of[d,m,f,h,_,v])e.current.instanceMatrix.needsUpdate=!0;for(let e=p;e<g.current.length;e++)g.current[e]&&(g.current[e].visible=!1)});let A=e=>t=>{t.stopPropagation();let n=C.current[e][t.instanceId];n&&s(n)};return(0,H.jsxs)(`group`,{children:[(0,H.jsx)(`instancedMesh`,{ref:d,args:[c,null,$],castShadow:!0,onClick:A(`ship`),children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,roughness:.55,metalness:.15})}),(0,H.jsxs)(`instancedMesh`,{ref:m,args:[null,null,$],children:[(0,H.jsx)(`planeGeometry`,{args:[1,1]}),(0,H.jsx)(`meshBasicMaterial`,{map:S,transparent:!0,opacity:.55,depthWrite:!1})]}),(0,H.jsx)(`instancedMesh`,{ref:_,args:[l,null,$],castShadow:!0,onClick:A(`ship`),children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,map:x,roughness:.6,metalness:.2})}),(0,H.jsx)(`instancedMesh`,{ref:f,args:[y,null,$],castShadow:!0,onClick:A(`truck`),children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,roughness:.45,metalness:.3})}),(0,H.jsx)(`instancedMesh`,{ref:v,args:[b,null,$],castShadow:!0,onClick:A(`truck`),children:(0,H.jsx)(`meshStandardMaterial`,{vertexColors:!0,map:x,roughness:.6,metalness:.2})}),(0,H.jsxs)(`instancedMesh`,{ref:h,args:[null,null,$],children:[(0,H.jsx)(`boxGeometry`,{args:[.13,.02,.01]}),(0,H.jsx)(`meshBasicMaterial`,{color:k,toneMapped:!1})]}),Array.from({length:40}).map((e,t)=>(0,H.jsx)(`sprite`,{ref:e=>g.current[t]=e,visible:!1,scale:[.024,.024,1],renderOrder:25,onClick:e=>{e.stopPropagation();let t=e.object.userData.id;t&&s(t)},children:(0,H.jsx)(`spriteMaterial`,{transparent:!0,depthTest:!1,sizeAttenuation:!1,toneMapped:!1})},t))]})}var Wt={pos:new u(3,19,27),target:new u(2,0,4.5)};function Gt({controls:e,apiRef:t}){let{camera:n}=ee(),r=(0,V.useRef)({pos:Wt.pos.clone(),target:Wt.target.clone(),on:!0});return(0,V.useMemo)(()=>n.position.set(30,40,50),[n]),(0,V.useImperativeHandle)(t,()=>{let t=t=>{let i=e.current;if(!i)return;let a=i.target.clone(),o=new ce().setFromVector3(n.position.clone().sub(a));t(o),o.phi=Math.max(.08,Math.min(1.38,o.phi)),o.radius=Math.max(4,Math.min(60,o.radius)),r.current={pos:new u().setFromSpherical(o).add(a),target:a,on:!0}};return{zoom:e=>t(t=>{t.radius*=e}),rotate:e=>t(t=>{t.theta+=e*Math.PI/180}),top:()=>t(e=>{e.phi=.08}),tilt:e=>t(t=>{t.phi=e==null?1:t.phi+e*Math.PI/180}),perspective:()=>t(e=>{e.phi=.9}),side:()=>t(e=>{e.phi=1.35,e.radius=Math.min(e.radius,14)}),north:()=>t(e=>{e.theta=0}),home:()=>{r.current={pos:Wt.pos.clone(),target:Wt.target.clone(),on:!0}},focus:e=>{let t=J[e];if(!t)return;let n=new u(t[0],Y,t[1]);r.current={pos:n.clone().add(new u(2.5,5.5,7)),target:n,on:!0}}}},[n,e]),(0,V.useEffect)(()=>{let t=e.current;if(!t)return;let n=()=>{r.current.on=!1};return t.addEventListener(`start`,n),()=>t.removeEventListener(`start`,n)},[e]),j((t,i)=>{let a=e.current;if(a){if(r.current.on){let e=Math.min(1,i*2);n.position.lerp(r.current.pos,e),a.target.lerp(r.current.target,e),n.position.distanceTo(r.current.pos)<.05&&(r.current.on=!1)}a.update()}}),null}function Kt(e){let t=(e,t,n)=>`#`+new p(N(e)).lerp(new p(N(t)),n).getHexString();return{night:e,fog:e?N(`--page-bg`):t(`--bx-wash-6`,`--white`,.3),water:e?t(`--brand-navy`,`--chart-c1`,.3):t(`--chart-o4`,`--chart-c4`,.25),sun:e?t(`--brand-navy`,`--sky`,.35):N(`--brand-white`),seabed:t(`--chart-o4`,`--chart-c4`,.3),sand:t(`--brand-peach-soft`,`--brand-orange`,.18),grass:e?t(`--chart-c4`,`--brand-navy`,.55):t(`--chart-c4`,`--chart-c2`,.12),hill:e?t(`--chart-c4`,`--brand-navy`,.72):t(`--chart-c4`,`--brand-navy`,.35),tree1:e?t(`--chart-c4`,`--brand-navy`,.6):t(`--chart-c4`,`--brand-navy`,.3),tree2:e?t(`--chart-c4`,`--brand-navy`,.7):t(`--chart-c4`,`--brand-navy`,.45),tree3:e?t(`--chart-c4`,`--chart-c2`,.25):t(`--chart-c4`,`--chart-c2`,.3),trunk:t(`--chart-c2`,`--brand-navy`,.6),facade:e?t(`--muted-ink`,`--brand-navy`,.35):t(`--white`,`--muted-fill`,.6),windowDay:t(`--chart-o2`,`--brand-navy`,.35),windowDark:e?t(`--brand-navy`,`--muted-ink`,.2):t(`--chart-o3`,`--brand-navy`,.3),windowLit:t(`--brand-orange`,`--brand-white`,.45),lamp:t(`--brand-orange`,`--brand-white`,.55),concrete:e?t(`--muted-ink`,`--brand-navy`,.45):t(`--muted-fill`,`--muted-ink`,.25),quayEdge:N(`--brand-orange`),roof:t(`--muted-ink`,`--brand-navy`,.25),roofLight:t(`--muted-ink`,`--white`,.35),hvac:t(`--muted-ink`,`--white`,.5),door:t(`--chart-o3`,`--brand-navy`,.4),tank:t(`--white`,`--muted-ink`,.15),stack:t(`--white`,`--muted-ink`,.2),stackBand:N(`--depth-0`),smoke:t(`--muted-fill`,`--muted-ink`,.3),asphalt:e?t(`--brand-navy`,`--muted-ink`,.3):t(`--muted-ink`,`--brand-navy`,.4),laneMark:t(`--brand-white`,`--brand-orange`,.2),roadGlow:e?N(`--sky`):t(`--sky`,`--white`,.3),seaRoute:N(`--cyan`),pole:t(`--muted-ink`,`--brand-navy`,.3),ok:N(`--chart-c4`),watch:N(`--brand-orange`),late:N(`--depth-0`),plant:N(`--depth-2`),plantPin:N(`--brand-blue`),crane:N(`--chart-c1`),bridge:N(`--brand-white`),window:t(`--brand-navy`,`--chart-o3`,.2),hull:t(`--brand-navy`,`--depth-0`,.15),hullStripe:N(`--depth-0`),deck:t(`--muted-ink`,`--depth-0`,.3),funnel:N(`--brand-orange`),box1:N(`--brand-blue`),box2:N(`--brand-orange`),box3:N(`--depth-0`),box4:N(`--chart-c4`),box5:t(`--brand-white`,`--muted-fill`,.3),trailer:N(`--brand-white`),trailerStripe:N(`--brand-blue`),cab:N(`--depth-0`),chassis:t(`--brand-navy`,`--muted-ink`,.2),tyre:t(`--brand-navy`,`--page-bg`,.6),card:N(`--node-glass`),cardInk:N(`--text-primary`),cardMuted:N(`--text-secondary`),antifoul:t(`--depth-0`,`--brand-navy`,.35),boot:N(`--brand-white`),funnelTop:t(`--brand-navy`,`--page-bg`,.5),box6:t(`--chart-c1`,`--brand-navy`,.35),cabBody:N(`--brand-white`),cabStripe:N(`--brand-blue`),grille:t(`--brand-navy`,`--muted-ink`,.3),chrome:t(`--muted-fill`,`--muted-ink`,.2),glass:e?t(`--chart-o1`,`--brand-navy`,.65):t(`--chart-o2`,`--sky`,.4),glassDark:e?t(`--chart-o3`,`--brand-navy`,.7):t(`--chart-o3`,`--sky`,.25),mullion:e?t(`--muted-ink`,`--brand-navy`,.5):t(`--muted-fill`,`--muted-ink`,.35),wallLight:e?t(`--muted-ink`,`--brand-navy`,.3):t(`--white`,`--muted-fill`,.5),solar:t(`--chart-o4`,`--brand-navy`,.45),roofWhite:e?t(`--muted-ink`,`--brand-navy`,.2):t(`--white`,`--muted-fill`,.3),sign:N(`--brand-purple`),steam:t(`--white`,`--muted-fill`,.2),fence:t(`--muted-ink`,`--white`,.3),apronMark:t(`--brand-orange`,`--brand-white`,.2),rtg:t(`--brand-orange`,`--brand-white`,.1),craneWhite:t(`--brand-white`,`--muted-fill`,.2)}}var qt=(0,V.forwardRef)(function({data:e,cards:t,theme:n,simDayRef:r,filters:i,statusOf:a,selected:o,onSelectSupplier:s,onPickShipment:c,inbound:l},u){let d=(0,V.useRef)(),f=n===`dark`,p=(0,V.useMemo)(()=>Kt(f),[n]),m=(0,V.useMemo)(()=>bt(e.lanes),[e]),g=(0,V.useMemo)(()=>it(p),[p]),_=(0,V.useMemo)(()=>at(p),[p]),v=(0,V.useMemo)(()=>Object.fromEntries((t||[]).map(e=>[e.supplier_id,e])),[t]),y=(0,V.useMemo)(()=>{let t=new Map;return e.lanes.forEach(e=>{let n=m[e.id];if(!n)return;let r=n.mode===`SEA`?`port>${e.plant_id}`:e.id;t.has(r)||t.set(r,{curve:n.road,supplier:n.mode===`SEA`?null:e.supplier_id})}),[...t.values()]},[e,m]);return(0,H.jsxs)(ae,{shadows:!0,flat:!0,dpr:[1,1.75],camera:{fov:40,near:.1,far:400,position:[30,40,50]},onContextMenu:e=>e.preventDefault(),children:[(0,H.jsx)(`color`,{attach:`background`,args:[p.fog]}),(0,H.jsx)(`fog`,{attach:`fog`,args:[p.fog,38,90]}),(0,H.jsxs)(V.Suspense,{fallback:null,children:[(0,H.jsx)(fe,{files:f?`/env/dikhololo_night_1k.hdr`:`/env/venice_sunset_1k.hdr`,background:!f,backgroundBlurriness:.35,backgroundIntensity:.9,environmentIntensity:f?.55:.9}),(0,H.jsx)(Ot,{C:p})]}),f&&(0,H.jsx)(Ue,{radius:140,depth:50,count:2200,factor:3.2,fade:!0,speed:.35}),(0,H.jsx)(`ambientLight`,{intensity:f?.25:.35}),(0,H.jsx)(`directionalLight`,{position:f?[-14,20,10]:[16,18,12],intensity:f?.8:2.2,color:f?p.sun:p.lamp,castShadow:!0,"shadow-mapSize":[2048,2048],"shadow-bias":-4e-4,"shadow-camera-left":-26,"shadow-camera-right":26,"shadow-camera-top":22,"shadow-camera-bottom":-22}),(0,H.jsx)(kt,{C:p}),(0,H.jsx)(At,{C:p}),(0,H.jsx)(jt,{C:p}),i.road&&y.map((e,t)=>(0,H.jsx)(Nt,{curve:e.curve,C:p,dim:!!o&&!!e.supplier&&e.supplier!==o},t)),i.road&&(0,H.jsx)(Pt,{curves:y.map(e=>e.curve),C:p}),i.sea&&e.lanes.filter(e=>m[e.id]?.sea).map(e=>(0,H.jsx)(Ft,{curve:m[e.id].sea,C:p,dim:!!o&&e.supplier_id!==o},e.id)),Object.keys(v).filter(e=>J[e]).map(e=>(0,H.jsx)(zt,{id:e,s:v[e],status:a(e),C:p,selected:o===e,dim:!i.status.has(a(e)),onClick:s},e)),(0,H.jsx)(Bt,{id:`IN-TN-01`,label:`Chennai Plant`,C:p,inbound:l[`IN-TN-01`]||0}),(0,H.jsx)(Bt,{id:`IN-KA-01`,label:`Bengaluru Plant`,C:p,inbound:l[`IN-KA-01`]||0}),(0,H.jsx)(Vt,{C:p,inbound:l.port||0,shipGeo:g,cargoGeo:_}),(0,H.jsx)(Ut,{data:e,routes:m,simDayRef:r,C:p,filters:i,statusOf:a,selectedSupplier:o,onPick:c,shipGeo:g,cargoGeo:_}),(0,H.jsx)(oe,{ref:d,makeDefault:!0,enableDamping:!0,dampingFactor:.08,maxPolarAngle:1.38,minDistance:4,maxDistance:60,mouseButtons:{LEFT:h.ROTATE,MIDDLE:h.DOLLY,RIGHT:h.PAN}}),(0,H.jsx)(Gt,{controls:d,apiRef:u}),(0,H.jsxs)(_e,{multisampling:0,children:[(0,H.jsx)(he,{intensity:f?1.35:.35,luminanceThreshold:f?.6:.92,luminanceSmoothing:.25,mipmapBlur:!0}),(0,H.jsx)(de,{mode:ve.ACES_FILMIC}),(0,H.jsx)(pe,{}),(0,H.jsx)(ge,{eskil:!1,offset:.28,darkness:f?.65:.3})]})]})});export{Dt as Card,Ot as Ocean,J as SITES,Ze as a,Ht as badgeTexture,bt as buildRoutes,Ue as c,qt as default,Tt as foamTexture,Z as heightAt,it as i,ze as l,dt as n,st as o,at as r,ot as s,Kt as scenePalette,St as shipGeometry,ct as t,Ct as truckGeometry};