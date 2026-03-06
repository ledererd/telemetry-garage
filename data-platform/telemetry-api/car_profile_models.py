"""
Pydantic models for car profile data.
"""

from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Literal


class GeneralParams(BaseModel):
    """General vehicle parameters."""
    lf: float = Field(..., description="[m] Distance front axle to center of gravity")
    lr: float = Field(..., description="[m] Distance rear axle to center of gravity")
    h_cog: float = Field(..., ge=0, description="[m] Height of center of gravity")
    sf: float = Field(..., ge=0, description="[m] Track width front")
    sr: float = Field(..., ge=0, description="[m] Track width rear")
    m: float = Field(..., ge=0, description="[kg] Vehicle mass including driver excluding fuel")
    f_roll: float = Field(..., ge=0, description="[-] Rolling resistance coefficient")
    c_w_a: float = Field(..., description="[m^2] c_w * A_car -> air resistance calculation")
    c_z_a_f: float = Field(..., description="[m^2] c_z_f * A_frontwing")
    c_z_a_r: float = Field(..., description="[m^2] c_z_r * A_rearwing")
    g: float = Field(default=9.81, description="[m/s^2] Gravitational acceleration")
    rho_air: float = Field(..., ge=0, description="[kg/m^3] Air density")
    drs_factor: float = Field(..., ge=0, le=1, description="[-] Part of reduction of air resistance by DRS")


class EngineParams(BaseModel):
    """Engine/powertrain parameters."""
    topology: Literal["RWD", "AWD", "FWD"] = Field(..., description="Drive topology")
    
    # ICE (Internal Combustion Engine) parameters
    pow_max: Optional[float] = Field(default=None, ge=0, description="[W] Maximum power")
    pow_diff: Optional[float] = Field(default=None, ge=0, description="[W] Power drop from maximum power at n_begin and n_end")
    n_begin: Optional[float] = Field(default=None, ge=0, description="[1/min] Engine rpm at pow_max - pow_diff")
    n_max: Optional[float] = Field(default=None, ge=0, description="[1/min] Engine rpm at pow_max")
    n_end: Optional[float] = Field(default=None, ge=0, description="[1/min] Engine rpm at pow_max - pow_diff (should be greater than n_shift)")
    be_max: Optional[float] = Field(default=None, ge=0, description="[kg/h] Fuel consumption")
    
    # EV/Hybrid parameters
    pow_e_motor: Optional[float] = Field(default=None, ge=0, description="[W] Total electric motor power (after efficiency losses)")
    eta_e_motor: Optional[float] = Field(default=None, ge=0, le=1, description="[-] Efficiency electric motor (drive)")
    eta_e_motor_re: Optional[float] = Field(default=None, ge=0, le=1, description="[-] Efficiency electric motor (recuperation)")
    eta_etc_re: Optional[float] = Field(default=None, ge=0, le=1, description="[-] Efficiency electric turbocharger (recuperation)")
    vel_min_e_motor: Optional[float] = Field(default=None, ge=0, description="[m/s] Minimum velocity to use electric motor")
    torque_e_motor_max: Optional[float] = Field(default=None, ge=0, description="[Nm] Maximum torque of electric motor (after efficiency losses)")
    
    class Config:
        # Allow extra fields and populate by name for backward compatibility
        extra = "ignore"


class GearboxParams(BaseModel):
    """Gearbox/transmission parameters."""
    i_trans: List[float] = Field(..., min_items=1, description="[-] Gear ratios (from tire to engine)")
    n_shift: List[float] = Field(..., min_items=1, description="[1/min] Shift RPM for each gear")
    e_i: List[float] = Field(..., min_items=1, description="[-] Torsional mass factor for each gear")
    eta_g: float = Field(..., ge=0, le=1, description="[-] Efficiency of gearbox/transmission")


class TireParams(BaseModel):
    """Tire parameters for front or rear."""
    circ_ref: float = Field(..., ge=0, description="[m] Loaded reference circumference")
    fz_0: float = Field(..., ge=0, description="[N] Nominal tire load")
    mux: float = Field(..., description="[-] Coefficient of friction at nominal tire load (longitudinal)")
    muy: float = Field(..., description="[-] Coefficient of friction at nominal tire load (lateral)")
    dmux_dfz: float = Field(..., description="[-] Reduction of force potential with rising tire load (negative value)")
    dmuy_dfz: float = Field(..., description="[-] Reduction of force potential with rising tire load (negative value)")


class TiresParams(BaseModel):
    """Complete tire parameters for front and rear."""
    f: TireParams = Field(..., description="Front tire parameters")
    r: TireParams = Field(..., description="Rear tire parameters")
    tire_model_exp: float = Field(..., ge=1.0, le=2.0, description="[-] Exponent used in tire model to adjust shape of friction circle")


class CarProfileData(BaseModel):
    """Complete car profile data structure."""
    powertrain_type: Literal["electric", "hybrid", "combustion"] = Field(..., description="Powertrain type")
    general: GeneralParams = Field(..., description="General vehicle parameters")
    engine: EngineParams = Field(..., description="Engine/powertrain parameters")
    gearbox: GearboxParams = Field(..., description="Gearbox/transmission parameters")
    tires: TiresParams = Field(..., description="Tire parameters")
    
    class Config:
        # Allow extra fields for backward compatibility with existing profiles
        extra = "ignore"
    
    @model_validator(mode='after')
    def validate_powertrain_params(self):
        """
        Validate that required parameters are present based on powertrain type.
        This validation is lenient - it only warns about missing fields but doesn't
        fail validation to allow loading existing profiles that may be missing fields.
        """
        engine = self.engine
        
        # Only validate if engine object exists and has been properly initialized
        if not engine:
            return self
        
        # Check for missing required fields but don't raise errors - just log warnings
        # This allows existing profiles to be loaded even if they're missing fields
        missing = []
        
        if self.powertrain_type == "electric":
            # Electric vehicles require EV parameters
            if engine.pow_e_motor is None:
                missing.append("pow_e_motor")
            if engine.eta_e_motor is None:
                missing.append("eta_e_motor")
            if engine.eta_e_motor_re is None:
                missing.append("eta_e_motor_re")
            if engine.torque_e_motor_max is None:
                missing.append("torque_e_motor_max")
        
        elif self.powertrain_type == "combustion":
            # ICE vehicles require ICE parameters
            if engine.pow_max is None:
                missing.append("pow_max")
            if engine.pow_diff is None:
                missing.append("pow_diff")
            if engine.n_begin is None:
                missing.append("n_begin")
            if engine.n_max is None:
                missing.append("n_max")
            if engine.n_end is None:
                missing.append("n_end")
            if engine.be_max is None:
                missing.append("be_max")
        
        elif self.powertrain_type == "hybrid":
            # Hybrid vehicles require both ICE and EV parameters
            if engine.pow_max is None:
                missing.append("pow_max")
            if engine.pow_diff is None:
                missing.append("pow_diff")
            if engine.n_begin is None:
                missing.append("n_begin")
            if engine.n_max is None:
                missing.append("n_max")
            if engine.n_end is None:
                missing.append("n_end")
            if engine.be_max is None:
                missing.append("be_max")
            if engine.pow_e_motor is None:
                missing.append("pow_e_motor")
            if engine.eta_e_motor is None:
                missing.append("eta_e_motor")
            if engine.eta_e_motor_re is None:
                missing.append("eta_e_motor_re")
            if engine.torque_e_motor_max is None:
                missing.append("torque_e_motor_max")
        
        # Log warning but don't fail validation - allows loading existing profiles
        if missing:
            import warnings
            warnings.warn(
                f"Car profile powertrain type '{self.powertrain_type}' is missing "
                f"recommended fields: {', '.join(missing)}. "
                f"These fields should be added for proper functionality."
            )
        
        return self


class CarProfileCreate(BaseModel):
    """Model for creating a new car profile."""
    profile_id: str = Field(..., description="Unique car profile identifier")
    name: str = Field(..., description="Car profile name")
    veh_pars: CarProfileData = Field(..., description="Vehicle parameters")


class CarProfileUpdate(BaseModel):
    """Model for updating a car profile."""
    name: Optional[str] = Field(None, description="Car profile name")
    veh_pars: Optional[CarProfileData] = Field(None, description="Vehicle parameters")


class CarProfile(BaseModel):
    """Complete car profile model."""
    profile_id: str = Field(..., description="Unique car profile identifier")
    name: str = Field(..., description="Car profile name")
    veh_pars: CarProfileData = Field(..., description="Vehicle parameters")
    created_at: Optional[str] = Field(None, description="Creation timestamp")
    updated_at: Optional[str] = Field(None, description="Last update timestamp")

    class Config:
        json_schema_extra = {
            "example": {
                "profile_id": "electric_2024",
                "name": "Electric Race Car 2024",
                "veh_pars": {
                    "powertrain_type": "electric",
                    "general": {
                        "lf": 1.906,
                        "lr": 1.194,
                        "h_cog": 0.345,
                        "sf": 1.3,
                        "sr": 1.3,
                        "m": 880.0,
                        "f_roll": 0.02,
                        "c_w_a": 1.15,
                        "c_z_a_f": 1.24,
                        "c_z_a_r": 1.52,
                        "g": 9.81,
                        "rho_air": 1.18,
                        "drs_factor": 0.0
                    },
                    "engine": {
                        "topology": "RWD",
                        "pow_e_motor": 200000.0,
                        "eta_e_motor": 0.9,
                        "eta_e_motor_re": 0.9,
                        "eta_etc_re": 0.10,
                        "vel_min_e_motor": 27.777,
                        "torque_e_motor_max": 150.0
                    },
                    "gearbox": {
                        "i_trans": [0.056, 0.091],
                        "n_shift": [19000.0, 19000.0],
                        "e_i": [1.04, 1.04],
                        "eta_g": 0.96
                    },
                    "tires": {
                        "f": {
                            "circ_ref": 2.168,
                            "fz_0": 2500.0,
                            "mux": 1.22,
                            "muy": 1.22,
                            "dmux_dfz": -2.5e-5,
                            "dmuy_dfz": -2.5e-5
                        },
                        "r": {
                            "circ_ref": 2.168,
                            "fz_0": 2500.0,
                            "mux": 1.42,
                            "muy": 1.42,
                            "dmux_dfz": -2.0e-5,
                            "dmuy_dfz": -2.0e-5
                        },
                        "tire_model_exp": 2.0
                    }
                }
            }
        }


class CarProfileList(BaseModel):
    """List of car profiles."""
    profiles: List[CarProfile]
    count: int

